const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['client', 'agent', 'admin'], required: true },
  company: { type: String, trim: true },
  industry: { type: String, trim: true, maxlength: 80 },
  companySize: { type: String, trim: true, maxlength: 32 },
  country: { type: String, trim: true, maxlength: 80 },
  website: { type: String, trim: true, maxlength: 200 },
  supportContext: { type: String, trim: true, maxlength: 1000 },
  apiKey: { type: String, unique: true, sparse: true },
  slaMinutes: { type: Number, default: 15, min: 1, max: 1440 },
  tokenVersion: { type: Number, default: 0 },
  privacyAcceptedAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);