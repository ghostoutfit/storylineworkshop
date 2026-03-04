// Storyline Workshop — Configuration
// Edit this file to connect your Google Sheet, Google Form, and Firebase project.

const CONFIG = {
  // Google Sheet published as TSV
  // To get this URL: File → Share → Publish to web → Tab-separated values
  sheetUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSTeFqJdiBjYIiYLba9ldh_b_kQZWAc0EoHOTdm4xDl8jI80y22a9mc5Izfavdy-6WzTz9olmazwWue/pub?output=tsv',

  // Google Form URL for submitting new resources
  formUrl: 'https://docs.google.com/forms/d/FORM_ID/viewform',

  // Contact email shown in footer
  contactEmail: 'email@example.com',

  // Firebase project configuration
  // Create a project at https://console.firebase.google.com/
  // Then: Project Settings → Your apps → Web app → firebaseConfig
  firebase: {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    storageBucket: 'YOUR_PROJECT.appspot.com',
    messagingSenderId: 'YOUR_SENDER_ID',
    appId: 'YOUR_APP_ID'
  },

  // Default filter values on page load
  defaults: {
    program: 'OpenSciEd',
    course: 'HS Physics'
  }
};
