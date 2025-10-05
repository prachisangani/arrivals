# Flight Pickup Timer MVP

## Overview
An app that calculates when you should leave your current location to pick someone up from the airport on time, considering real-time flight data and traffic conditions.

## Features
- Real-time flight tracking
- Traffic-aware departure time calculation
- Optional reminder notifications
- OpenAI integration for enhanced user experience

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Create a `.env` file with:
```
OPENAI_API_KEY=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
AVIATIONSTACK_API_KEY=22b71910eece094d5e22a5bca2876bf9
GOOGLE_MAPS_API_KEY=AIzaSyBIFVB4vMjPkg_mP8si7MaPFFK5vx43Pxk
PORT=3000
```

### 3. Get API Keys

#### OpenAI API Key
1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Add it to your `.env` file

#### AviationStack API Key (for flight data)
1. Go to https://aviationstack.com/
2. Sign up for a free account
3. Get your API key from the dashboard
4. Add it to your `.env` file

#### Google Maps API Key (for traffic data)
1. Go to https://console.cloud.google.com/
2. Enable the "Maps JavaScript API" and "Distance Matrix API"
3. Create credentials and get your API key
4. Add it to your `.env` file

### 4. Run the Application
```bash
npm start
```

Visit http://localhost:3000 to use the app.

## How It Works

1. **Flight Data Fetching**: Uses AviationStack API to get real-time flight information
2. **Traffic Calculation**: Uses Google Maps API to get current driving time
3. **Departure Time Calculation**: 
   - Flight arrival time + 15-30 min buffer
   - Subtract current driving time
   - Add 15-30 min safety buffer
4. **OpenAI Integration**: 
   - Parses natural language flight number input
   - Provides contextual advice and suggestions
   - Handles complex queries about timing

## Usage Examples

- Enter flight number: "AA1234"
- Ask: "When should I leave for United 456?"
- Set reminders for departure time
- Get weather and traffic updates
