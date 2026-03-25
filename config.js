// Storyline Workshop — Configuration
// Edit this file to connect your Google Sheet, Google Form, and Firebase project.

const CONFIG = {
  // Google Sheet published as TSV
  // To get this URL: File → Share → Publish to web → Tab-separated values
  sheetUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSTeFqJdiBjYIiYLba9ldh_b_kQZWAc0EoHOTdm4xDl8jI80y22a9mc5Izfavdy-6WzTz9olmazwWue/pub?output=tsv',

  // Google Form URL for submitting new resources
  formUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSc3YzMIhyPxmTG2TT48nRT2kHIUFt7koq4SnyplwMZF5KJB7w/viewform',

  // Contact email shown in footer
  contactEmail: 'email@example.com',

  // Firebase project configuration
  // Create a project at https://console.firebase.google.com/
  // Then: Project Settings → Your apps → Web app → firebaseConfig
  firebase: {
    apiKey: 'AIzaSyCSKvO6ICHR3tMQLPL-dBKQD7OiUDdFD8E',
    authDomain: 'storyline-workshop.firebaseapp.com',
    projectId: 'storyline-workshop',
    storageBucket: 'storyline-workshop.firebasestorage.app',
    messagingSenderId: '763019722507',
    appId: '1:763019722507:web:0a054cacc4e4fd5a7e6c0e'
  },

  // Default filter values on page load
  defaults: {
    program: 'OpenSciEd',
    course: 'HS Physics'
  }
};
