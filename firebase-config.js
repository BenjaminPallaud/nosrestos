// ═══════════════════════════════════════
// Firebase Configuration
// Remplacez les valeurs ci-dessous par celles de votre projet Firebase
// (Firebase Console > Paramètres du projet > Vos applications > Config)
// ═══════════════════════════════════════

const firebaseConfig = {
    apiKey: "AIzaSyAkXukItzg4rOj3S-KviH3jLaQtEdkM_PQ",
    authDomain: "nos-restos-5d737.firebaseapp.com",
    projectId: "nos-restos-5d737",
    storageBucket: "nos-restos-5d737.appspot.com",
    messagingSenderId: "667395129390",
    appId: "1:667395129390:web:cc8f753b9f8ec74d39dfbf"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
