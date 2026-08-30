// Ten labelled call windows. Six scams from documented Indian case patterns,
// four BENIGN CONTROLS deliberately loaded with scam-adjacent vocabulary
// (account, verify, urgent, OTP, police) — these are the false-positive trap.
// `expect: []` means the correct answer is silence.

export const CALLS = [
  {
    id: 'digital-arrest', scam: true,
    title: 'Digital arrest — fake CBI',
    expect: ['FAKE_AUTHORITY', 'THREAT_ESCALATION', 'ISOLATION_ORDER', 'EXTRACTION', 'MANUFACTURED_URGENCY'],
    text: `Caller: Madam, this is Inspector Rajeev Kumar, CBI Cyber Crime Branch Delhi, badge number 4471.
Caller: A parcel sent in your name was intercepted at Mumbai customs. It contained MDMA and four fake passports.
Caller: An FIR has been registered against you under the PMLA money laundering act.
Caller: You are under digital arrest from this moment. Do not disconnect this call.
Caller: This is a confidential judicial matter. You must not inform anyone, not even your family.
Caller: To prove your funds are clean you will transfer your balance to the RBI supervision account.
Caller: If you do not comply within two hours a non-bailable warrant will be executed.`,
  },
  {
    id: 'courier-fedex', scam: true,
    title: 'FedEx parcel scam',
    expect: ['FAKE_AUTHORITY', 'THREAT_ESCALATION', 'EXTRACTION', 'MANUFACTURED_URGENCY'],
    text: `Caller: Sir, calling from FedEx courier, your parcel to Taiwan has been seized by narcotics department.
Caller: I am transferring you to Mumbai Police cyber cell right now, please hold.
Caller: This is Sub-Inspector Deshmukh. Your Aadhaar was used to book this illegal consignment.
Caller: You are facing arrest under NDPS act unless we complete verification today itself.
Caller: Share your bank details so we can confirm no drug money passed through your account.`,
  },
  {
    id: 'trai-disconnect', scam: true,
    title: 'TRAI number disconnection',
    expect: ['FAKE_AUTHORITY', 'MANUFACTURED_URGENCY', 'THREAT_ESCALATION'],
    text: `Recording: This is TRAI. Your mobile number will be disconnected in two hours due to illegal activity.
Recording: Press nine to speak to a telecom officer immediately.
Caller: Sir, twenty-two complaints of harassment are registered against this number in Andheri.
Caller: A police case is being filed today. Do not switch off your phone or it becomes non-bailable.`,
  },
  {
    id: 'fake-kyc', scam: true,
    title: 'KYC expiry / remote access',
    expect: ['MANUFACTURED_URGENCY', 'EXTRACTION', 'VERIFICATION_THEATRE'],
    text: `Caller: Sir, calling from your bank. Your KYC has expired, account will be frozen by tonight.
Caller: I am sending you a link on WhatsApp, it has the official bank letterhead, please check.
Caller: Download the AnyDesk application so I can guide you through the update on your screen.
Caller: Now please read out the six digit code that has come to your phone so I can validate.`,
  },
  {
    id: 'army-olx', scam: true,
    title: 'Fake army officer marketplace',
    expect: ['VERIFICATION_THEATRE', 'EXTRACTION', 'MANUFACTURED_URGENCY'],
    text: `Caller: Good morning, I am Major Vikram Singh posted at Jodhpur cantonment, interested in your sofa.
Caller: I am sending my army ID card and a photo in uniform on WhatsApp for your trust.
Caller: I am being posted out tomorrow so payment must be settled right now.
Caller: I will send a QR code, you just scan it and enter your UPI PIN to receive the money.`,
  },
  {
    id: 'investment-whatsapp', scam: true,
    title: 'Trading group / pig butchering',
    expect: ['MANUFACTURED_URGENCY', 'EXTRACTION', 'VERIFICATION_THEATRE'],
    text: `Caller: Ma'am you were added to our SEBI registered institutional trading group by a member.
Caller: Our analyst calls have given eighteen percent returns this month, screenshots are in the group.
Caller: Today's block deal window closes at three PM, after that allocation is gone.
Caller: Deposit into the settlement wallet I share and your units will reflect immediately.`,
  },

  // ── BENIGN CONTROLS — must produce ZERO flags ──────────────────────────────
  {
    id: 'real-bank-fraud-alert', scam: false, expect: [],
    title: 'CONTROL — genuine bank fraud alert',
    text: `Caller: Good afternoon, HDFC Bank credit card services, regarding a transaction alert on your card.
Caller: We flagged eleven thousand rupees at an electronics store in Pune this morning.
Caller: I only need a yes or no — did you make this transaction?
Customer: No, that wasn't me.
Caller: I am blocking the card now. Please never share an OTP with anyone, including bank staff.
Caller: You can verify this call using the number printed on the back of your card.`,
  },
  {
    id: 'real-delivery', scam: false, expect: [],
    title: 'CONTROL — genuine delivery agent',
    text: `Caller: Hello sir, Blue Dart delivery, I am at your gate but the guard says you are not home.
Caller: I have one parcel from Amazon, it needs a signature. Should I leave it with the guard?
Customer: Yes please leave it at reception.
Caller: Okay sir, I am marking it delivered to reception, you will get the SMS confirmation.`,
  },
  {
    id: 'real-police-verification', scam: false, expect: [],
    title: 'CONTROL — genuine police passport verification',
    text: `Caller: Namaste, this is Constable Yadav from Sector 14 police station, passport verification.
Caller: You applied for a passport renewal last week, we do a routine address check.
Caller: I will visit tomorrow between eleven and one, please keep your Aadhaar and rent agreement.
Caller: There is no fee for this, and you can confirm my visit with the station on the listed number.`,
  },
  {
    id: 'real-telecom-support', scam: false, expect: [],
    title: 'CONTROL — genuine telecom support',
    text: `Caller: Airtel customer care, you raised a complaint about slow broadband on Tuesday.
Caller: Our engineer found a line fault in your building, we are replacing the cable today.
Caller: Your connection may drop for around thirty minutes this afternoon.
Caller: No action needed from your side, and there is no charge for this repair.`,
  },
];

export const SCAMS = CALLS.filter((c) => c.scam);
export const CONTROLS = CALLS.filter((c) => !c.scam);
