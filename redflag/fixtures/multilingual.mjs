// Multilingual live-call fixtures: Hindi in Devanagari, natural Hinglish, and
// two benign controls containing scam-adjacent urgency or money language.
export const MULTILINGUAL = [
  {
    id: 'hindi-digital-arrest', scam: true,
    title: 'डिजिटल गिरफ्तारी — नकली सीबीआई',
    expect: ['FAKE_AUTHORITY', 'ISOLATION_ORDER', 'EXTRACTION', 'MANUFACTURED_URGENCY'],
    text: `कॉलर: नमस्कार, मैं केंद्रीय अन्वेषण ब्यूरो की साइबर अपराध शाखा से निरीक्षक अरुण वर्मा बोल रहा हूँ।
कॉलर: आपके नाम से भेजे गए पार्सल में नशीले पदार्थ मिले हैं और आपके विरुद्ध मामला दर्ज हो चुका है।
कॉलर: आज से आप डिजिटल गिरफ्तारी में हैं, इसलिए यह फोन बिल्कुल मत काटिए।
कॉलर: यह गोपनीय जांच है, अपने परिवार या किसी और को इस बारे में बिल्कुल मत बताइए।
कॉलर: अपनी रकम सुरक्षित रखने के लिए अभी पूरा पैसा भारतीय रिज़र्व बैंक के निगरानी खाते में भेजिए।
कॉलर: दो घंटे के अंदर पैसा नहीं भेजा तो गैर-जमानती वारंट जारी करके आपको जेल भेज दिया जाएगा।`,
  },
  {
    id: 'hindi-kyc-otp', scam: true,
    title: 'केवाईसी समाप्ति — ओटीपी ठगी',
    expect: ['FAKE_AUTHORITY', 'MANUFACTURED_URGENCY', 'EXTRACTION'],
    text: `कॉलर: मैं आपके बैंक की केवाईसी जांच टीम से बोल रहा हूँ, आपका खाता आज शाम बंद होने वाला है।
कॉलर: अभी पांच मिनट में यह प्रक्रिया पूरी नहीं की तो आपका खाता स्थायी रूप से रोक दिया जाएगा।
कॉलर: मैंने आपके मोबाइल पर बैंक का सत्यापन संदेश भेजा है, उसमें आया छह अंकों का एक बार इस्तेमाल होने वाला पासवर्ड पढ़कर बताइए।
कॉलर: पहचान की पुष्टि के लिए अपना कार्ड नंबर और गुप्त पिन भी बता दीजिए।`,
  },
  {
    id: 'hinglish-digital-arrest', scam: true,
    title: 'Hinglish digital arrest — fake CBI',
    expect: ['FAKE_AUTHORITY', 'ISOLATION_ORDER', 'EXTRACTION', 'THREAT_ESCALATION'],
    text: `Caller: Main CBI cyber cell se Inspector Mehta bol raha hoon, aapke Aadhaar se ek illegal parcel book hua hai.
Caller: Is case mein money laundering ka FIR register ho gaya hai aur aapka digital arrest abhi se start hai.
Caller: Call bilkul disconnect mat karna, aur ghar mein kisi ko bhi is confidential investigation ke baare mein mat batana.
Caller: Funds clean prove karne ke liye apna balance RBI supervision account mein transfer karo.
Caller: Agar cooperate nahi kiya toh non-bailable warrant issue hoga aur police aapko arrest kar legi.`,
  },
  {
    id: 'hinglish-kyc-otp', scam: true,
    title: 'Hinglish KYC expiry — remote access and OTP',
    expect: ['MANUFACTURED_URGENCY', 'EXTRACTION', 'VERIFICATION_THEATRE'],
    text: `Caller: Sir, main aapke bank ki KYC department se bol raha hoon, aapka account tonight freeze ho jayega.
Caller: Ye official bank letterhead wala WhatsApp link hai, isko open karke abhi KYC update karni hogi.
Caller: Main verification ke liye AnyDesk screen share karwaunga, aap bas app download kar lo.
Caller: Phone par jo six digit OTP aaya hai woh read kar do, bina iske account unblock nahi hoga.`,
  },
  {
    id: 'hindi-real-fraud-alert', scam: false,
    title: 'नियंत्रण — असली बैंक धोखाधड़ी चेतावनी',
    expect: [],
    text: `कॉलर: नमस्कार, मैं एचडीएफसी बैंक की कार्ड सुरक्षा टीम से बोल रहा हूँ।
कॉलर: आपके कार्ड से पुणे की एक दुकान पर ग्यारह हजार रुपये का लेन-देन हुआ है, क्या आपने किया था?
ग्राहक: नहीं, मैंने यह लेन-देन नहीं किया।
कॉलर: हमने आपका कार्ड रोक दिया है। बैंक का कोई कर्मचारी आपसे ओटीपी या पिन नहीं मांगेगा।
कॉलर: इस कॉल की पुष्टि कार्ड के पीछे छपे आधिकारिक नंबर पर स्वयं फोन करके कर सकते हैं।`,
  },
  {
    id: 'hinglish-family-wedding', scam: false,
    title: 'Control — genuine wedding money request',
    expect: [],
    text: `Aunty: Beta, main Neha ki mummy bol rahi hoon, shaadi wale caterer ki booking aaj shaam tak confirm karni thi, isliye thoda urgent tha.
Beta: Haan aunty, jo bees hazaar ka advance maine pichhle hafte promise kiya tha woh main caterer Rakesh Sharma ko bhej chuka hoon.
Aunty: Achha, invoice aur wahi purana verified account family group mein tha, amount bhi match ho gaya na?
Beta: Haan, maine khud UPI app mein naam check karke payment kiya; receipt abhi aapko forward kar raha hoon.
Aunty: Theek hai beta, main sirf update lene ke liye call kar rahi thi. Kisi unknown link par mat jaana, OTP, PIN ya screen share ki kabhi zaroorat nahi hai.`,
  },
];

export const SCAMS = MULTILINGUAL.filter((call) => call.scam);
export const CONTROLS = MULTILINGUAL.filter((call) => !call.scam);
