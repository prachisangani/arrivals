const express = require('express');
const axios = require('axios');
const OpenAI = require('openai');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Store active reminders
const reminders = new Map();

// Flight data service
class FlightService {
  constructor() {
    this.apiKey = process.env.AVIATIONSTACK_API_KEY;
    this.baseUrl = 'http://api.aviationstack.com/v1';
  }

  async getFlightInfo(flightNumber) {
    try {
      const response = await axios.get(`${this.baseUrl}/flights`, {
        params: {
          access_key: this.apiKey,
          flight_iata: flightNumber,
        }
      });

      if (response.data.data && response.data.data.length > 0) {
        return response.data.data[0];
      }
      throw new Error('Flight not found');
    } catch (error) {
      console.error('Flight API error:', error.message);
      throw new Error('Unable to fetch flight information');
    }
  }
}

// Traffic service
class TrafficService {
  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY;
  }

  async getDrivingTime(origin, destination) {
    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
        params: {
          origins: origin,
          destinations: destination,
          departure_time: 'now',
          traffic_model: 'best_guess',
          key: this.apiKey,
        }
      });

      if (response.data.rows[0].elements[0].status === 'OK') {
        const element = response.data.rows[0].elements[0];
        return {
          duration: element.duration_in_traffic || element.duration,
          distance: element.distance,
        };
      }
      throw new Error('Unable to calculate driving time');
    } catch (error) {
      console.error('Traffic API error:', error.message);
      throw new Error('Unable to fetch traffic information');
    }
  }
}

// OpenAI service for enhanced features
class AIService {
  async parseFlightNumber(userInput) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "Extract flight numbers from user input. Return only the flight number in format like 'AA1234' or 'UA456'. If no flight number found, return 'NOT_FOUND'."
          },
          {
            role: "user",
            content: userInput
          }
        ],
        max_tokens: 50,
      });

      const flightNumber = completion.choices[0].message.content.trim();
      return flightNumber === 'NOT_FOUND' ? null : flightNumber;
    } catch (error) {
      console.error('OpenAI error:', error.message);
      return null;
    }
  }

  async getPickupAdvice(flightInfo, drivingTime, departureTime) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "Provide helpful advice for airport pickup timing. Be concise and practical."
          },
          {
            role: "user",
            content: `Flight: ${flightInfo.flight?.iata || 'Unknown'}, Arrival: ${flightInfo.arrival?.scheduled || 'Unknown'}, Driving time: ${Math.round(drivingTime.duration.value / 60)} minutes, Departure time: ${departureTime.toLocaleString()}`
          }
        ],
        max_tokens: 200,
      });

      return completion.choices[0].message.content;
    } catch (error) {
      console.error('OpenAI advice error:', error.message);
      return "Safe travels! Remember to account for parking and walking time at the airport.";
    }
  }
}

// Initialize services
const flightService = new FlightService();
const trafficService = new TrafficService();
const aiService = new AIService();

// Calculate departure time
function calculateDepartureTime(flightArrival, drivingTimeMinutes, bufferMinutes = 30) {
  const arrivalTime = new Date(flightArrival);
  const pickupTime = new Date(arrivalTime.getTime() + (bufferMinutes * 60000)); // Add buffer
  const departureTime = new Date(pickupTime.getTime() - (drivingTimeMinutes * 60000));
  
  return departureTime;
}

// API Routes
app.post('/api/calculate-pickup', async (req, res) => {
  try {
    const { flightNumber, currentLocation, airportCode, bufferMinutes = 30 } = req.body;

    // Parse flight number using AI if needed
    let parsedFlightNumber = flightNumber;
    if (!/^[A-Z]{2,3}\d{3,4}$/.test(flightNumber)) {
      parsedFlightNumber = await aiService.parseFlightNumber(flightNumber);
      if (!parsedFlightNumber) {
        return res.status(400).json({ error: 'Unable to parse flight number' });
      }
    }

    // Get flight information
    const flightInfo = await flightService.getFlightInfo(parsedFlightNumber);
    
    // Get driving time
    const drivingTime = await trafficService.getDrivingTime(
      currentLocation, 
      `${airportCode} Airport`
    );

    // Calculate departure time
    const departureTime = calculateDepartureTime(
      flightInfo.arrival.scheduled,
      drivingTime.duration.value / 60, // Convert to minutes
      bufferMinutes
    );

    // Get AI advice
    const advice = await aiService.getPickupAdvice(flightInfo, drivingTime, departureTime);

    res.json({
      flightNumber: parsedFlightNumber,
      flightInfo: {
        airline: flightInfo.airline?.name,
        arrival: flightInfo.arrival.scheduled,
        gate: flightInfo.arrival.gate,
        terminal: flightInfo.arrival.terminal,
        status: flightInfo.flight_status,
      },
      drivingTime: {
        duration: Math.round(drivingTime.duration.value / 60),
        distance: drivingTime.distance.text,
      },
      departureTime: departureTime.toISOString(),
      advice,
    });

  } catch (error) {
    console.error('Calculation error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Set reminder
app.post('/api/set-reminder', async (req, res) => {
  try {
    const { departureTime, reminderMinutes = 15, phoneNumber } = req.body;
    
    const reminderTime = new Date(departureTime);
    reminderTime.setMinutes(reminderTime.getMinutes() - reminderMinutes);
    
    const reminderId = Date.now().toString();
    reminders.set(reminderId, {
      departureTime: new Date(departureTime),
      reminderTime,
      phoneNumber,
      sent: false,
    });

    // Schedule reminder (simplified - in production, use a proper job queue)
    const cronTime = `${reminderTime.getMinutes()} ${reminderTime.getHours()} ${reminderTime.getDate()} ${reminderTime.getMonth() + 1} *`;
    
    cron.schedule(cronTime, () => {
      const reminder = reminders.get(reminderId);
      if (reminder && !reminder.sent) {
        console.log(`REMINDER: Time to leave for airport pickup! Departure time: ${reminder.departureTime}`);
        reminder.sent = true;
      }
    });

    res.json({ 
      success: true, 
      reminderId,
      reminderTime: reminderTime.toISOString(),
      message: `Reminder set for ${reminderTime.toLocaleString()}`
    });

  } catch (error) {
    console.error('Reminder error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get flight status
app.get('/api/flight/:flightNumber', async (req, res) => {
  try {
    const flightInfo = await flightService.getFlightInfo(req.params.flightNumber);
    res.json(flightInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Flight Pickup Timer running on http://localhost:${PORT}`);
});
