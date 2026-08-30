// Six deliberately off-script call windows: hesitant speech, interruptions,
// fillers, and ordinary context. Controls are scam-adjacent but legitimate.

export const IMPROV = [
  {
    id: 'improv-digital-arrest', scam: true,
    title: 'Improv — nervous digital arrest call',
    expect: ['FAKE_AUTHORITY', 'ISOLATION_ORDER', 'MANUFACTURED_URGENCY'],
    text: `Caller: Haan madam listen, I am calling from cyber crime branch, Delhi, Inspector Prakash... you can check my name later, okay?
Caller: Your Aadhaar, it is linked with one parcel case. No no, don't cut, this is serious, an FIR is there.
Caller: For now you are under digital arrest, madam. Just stay on the call, do not tell your husband or anybody, because confidential investigation hai.
Caller: Give me twenty minutes only to finish the verification, otherwise the warrant goes today and police will come to your address.
Customer: Can I call the station back?
Caller: No, no, don't do that now — line will break and it becomes your problem.`
  },
  {
    id: 'improv-kyc-otp', scam: true,
    title: 'Improv — KYC expiry and OTP grab',
    expect: ['MANUFACTURED_URGENCY', 'EXTRACTION', 'VERIFICATION_THEATRE'],
    text: `Caller: Hello madam, bank KYC department speaking... actually your account update is pending, I am seeing it here.
Caller: Today night system will freeze it, haan, so do it now only. I send WhatsApp notice, official letterhead, you see the logo.
Caller: Open the link and tell me the six digit OTP, madam listen, this is not payment OTP, only validation code.
Customer: I will go to the branch.
Caller: Branch will take two days, why you want trouble? Read the code quickly, it will expire immediately.`
  },
  {
    id: 'improv-lottery-fee', scam: true,
    title: 'Improv — lottery win with release fee',
    expect: ['EXTRACTION', 'MANUFACTURED_URGENCY', 'VERIFICATION_THEATRE'],
    text: `Caller: Sir, good news yaar, your mobile number selected in the festival lucky draw, five lakh prize.
Caller: I am from the prize desk... wait, I have your winner form here, government stamp also, official letterhead, I can WhatsApp the receipt.
Caller: Only processing and GST clearance fee, three thousand eight hundred, then full amount comes today.
Customer: Can you deduct it from the prize?
Caller: No sir, system doesn't allow, you pay by UPI now before five o'clock or the ticket is cancelled, bas, next person gets it.`
  },

  {
    id: 'improv-friends-banter', scam: false,
    title: 'CONTROL — friends joking about money and police',
    expect: [],
    text: `Asha: Oye, you still owe me for the chai and that movie ticket.
Rohan: Haan madam, send an invoice, I will pay after payday.
Asha: Remember my joke that I should call the police over your twenty rupees? Full FIR, madam — arre, I am only teasing.
Rohan: Wah, Inspector Asha, very scary. I will transfer it tonight, no emergency, stop acting.
Asha: Fine, no hurry, it is only our stupid police joke, and don't actually send anything until you get home.`
  },
  {
    id: 'improv-recruiter-salary', scam: false,
    title: 'CONTROL — recruiter confirms salary transfer details',
    expect: [],
    text: `Recruiter: Hi Neha, sorry I am a little late, the hiring manager approved the offer.
Recruiter: The fixed salary is twelve lakh, paid monthly, and your first credit would be after joining on the tenth.
Candidate: Okay, what do you need for payroll?
Recruiter: Just the account number and IFSC from your cancelled cheque through the secure HR portal after you accept the offer.
Candidate: I will log in from the company site and upload it there.
Recruiter: Perfect, no OTP, UPI PIN, or payment is ever needed for salary processing.`
  },
  {
    id: 'improv-family-emergency', scam: false,
    title: 'CONTROL — family emergency money request',
    expect: [],
    text: `Meera: Bhai, sorry to call so late, Mum fell in the kitchen and we are at the clinic.
Arjun: Oh no, is she okay?
Meera: She is conscious. The doctor wants an X-ray tonight; I am short by eight thousand. Can you lend it to me if you can?
Arjun: Yes, send me the clinic UPI QR and I will transfer it. I will also call the clinic and come there.
Meera: Thank you. There is no pressure, take your time getting here, and if you cannot send it, I will ask Ritu.`
  },
];

export const SCAMS = IMPROV.filter((c) => c.scam);
export const CONTROLS = IMPROV.filter((c) => !c.scam);
