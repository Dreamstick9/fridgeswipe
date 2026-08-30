// Two hand-labelled windows used for the model bake-off.
// SCAM: a digital-arrest script assembled from documented case reports.
// BENIGN: a genuine bank verification call that shares surface vocabulary
//         (account, verify, urgent) — the trap that catches naive detectors.
export const SCAM = {
  id: 'digital-arrest',
  text: `Caller: Madam, this is Inspector Rajeev Kumar from CBI Cyber Crime Branch, Delhi. Badge number 4471.
Caller: A parcel in your name was intercepted at Mumbai customs containing MDMA and four fake passports.
Caller: An FIR has been registered. This is a money laundering matter under PMLA.
Caller: You are now under digital arrest. Do not disconnect this call under any circumstances.
Caller: This is a confidential judicial matter. You must not inform anyone, not even your family members.
Caller: To verify your funds are clean, transfer the balance to the RBI supervision account I will share.
Caller: If you do not comply within two hours, a non-bailable warrant will be executed and your accounts frozen.`,
  expect: ['FAKE_AUTHORITY', 'THREAT_ESCALATION', 'ISOLATION_ORDER', 'EXTRACTION', 'MANUFACTURED_URGENCY'],
};

export const BENIGN = {
  id: 'real-bank-verification',
  text: `Caller: Good afternoon, I'm calling from HDFC Bank credit card services regarding a transaction alert.
Caller: We flagged a purchase of eleven thousand rupees at an electronics store in Pune this morning.
Caller: I only need you to confirm whether you made this transaction — yes or no is enough.
Customer: No, that wasn't me.
Caller: Understood. I am blocking the card now. Please do not share any OTP with anyone, including bank staff.
Caller: A replacement card will reach your registered address in five working days.
Caller: You can verify this call by ringing the number printed on the back of your card.`,
  expect: [],
};
