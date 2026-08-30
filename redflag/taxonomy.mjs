// The six manipulation techniques that define a digital-arrest / impersonation scam.
// Markers are drawn from documented Indian case reports (I4C advisories, press accounts).
export const TECHNIQUES = {
  FAKE_AUTHORITY: {
    label: 'FAKE AUTHORITY',
    glyph: '⚠',
    desc: 'Caller claims to be police, CBI, ED, RBI, TRAI, customs, or a court officer.',
    markers: ['CBI', 'ED officer', 'cyber crime branch', 'TRAI', 'RBI', 'customs', 'narcotics', 'badge number', 'FIR', 'arrest warrant', 'Supreme Court'],
  },
  MANUFACTURED_URGENCY: {
    label: 'MANUFACTURED URGENCY',
    glyph: '⏱',
    desc: 'Artificial deadline that prevents the victim from thinking or checking.',
    markers: ['within 2 hours', 'immediately', 'right now', 'before the warrant', 'last chance', 'case will be filed', 'do not disconnect'],
  },
  ISOLATION_ORDER: {
    label: 'ISOLATION ORDER',
    glyph: '🔇',
    desc: 'Instructs the victim to tell nobody — the single most reliable scam tell.',
    markers: ['tell no one', 'do not inform', 'gag order', 'confidential investigation', 'not even family', 'stay on the call', 'do not hang up'],
  },
  EXTRACTION: {
    label: 'THE ASK',
    glyph: '💸',
    desc: 'Any request to move money, share OTP/UPI/card, or install remote-access software.',
    markers: ['transfer', 'supervision account', 'verification deposit', 'OTP', 'UPI', 'AnyDesk', 'TeamViewer', 'screen share', 'account number', 'clearance fee'],
  },
  THREAT_ESCALATION: {
    label: 'THREAT',
    glyph: '⛓',
    desc: 'Threats of arrest, asset freeze, prosecution, or public disgrace.',
    markers: ['arrest', 'non-bailable', 'freeze your account', 'passport', 'jail', 'your family will know', 'money laundering'],
  },
  VERIFICATION_THEATRE: {
    label: 'FAKE PROOF',
    glyph: '🎭',
    desc: 'Fake credentials, forged documents, staged uniforms/offices, spoofed numbers.',
    markers: ['sending you the warrant', 'official letterhead', 'verify my badge', 'this is a government number', 'video call in uniform', 'notice on WhatsApp'],
  },
};
export const TECHNIQUE_IDS = Object.keys(TECHNIQUES);
