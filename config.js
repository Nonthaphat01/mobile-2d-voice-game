// My Little Neighborhood V5 — Firebase Web App configuration
// Web API key is a public client identifier, not a server secret.
// Never put service account keys, Admin SDK credentials, or service-role keys here.
window.GAME_CONFIG = {
  // Enable after deploying neighborhoodMarket and its database rules.
  onlineMarket: false,
  // Set to the deployed, verified Google Apps Script /exec URL to use the Sheets market.
  sheetsMarketUrl: 'https://script.google.com/macros/s/AKfycbyBAWet6aSYzFktKy1utbYRXZkYuzmUlBHkJooTfnJngNGNws_xC91vMDm7DsAjPZicTA/exec',
  firebase: {
    apiKey: 'AIzaSyClJQjbn5LcGB6yfwXjmcD__223vQ3CBq8',
    authDomain: 'gamesurvival-58e92.firebaseapp.com',
    databaseURL: 'https://gamesurvival-58e92-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'gamesurvival-58e92',
    storageBucket: 'gamesurvival-58e92.firebasestorage.app',
    messagingSenderId: '536376546379',
    appId: '1:536376546379:web:462374863d0cc2103be9ce',
    measurementId: 'G-MTQQJJ2MP4'
  }
};
