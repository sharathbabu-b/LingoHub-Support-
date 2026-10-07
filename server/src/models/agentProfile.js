const mongoose = require('mongoose');
const { LANGUAGE_CODES, LEVEL_CODES } = require('../lib/meta');
const { SKILLS, CHANNELS, TIERS } = require('../lib/capabilities');

const languageSchema = new mongoose.Schema(
  { code: { type: String, enum: LANGUAGE_CODES, required: true }, level: { type: String, enum: LEVEL_CODES, required: true } },
  { _id: false }
);

const agentProfileSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  headline: { type: String, default: '', maxlength: 120 },
  bio: { type: String, default: '', maxlength: 1000 },
  skills: { type: [String], enum: SKILLS, default: [] },
  experienceYears: { type: Number, min: 0, max: 50, default: 0 },
  channels: { type: [String], enum: CHANNELS, default: ['email', 'chat'] },
  tiers: { type: [String], enum: TIERS, default: ['tier1'] },
  timezone: { type: String, default: 'UTC' },
  languages: { type: [languageSchema], default: [] },
  hourlyRate: { type: Number, default: 8, min: 1, max: 500 },
  availableSlots: { type: [Number], default: [] },
  verified: { type: Boolean, default: false },
  ratingSum: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('AgentProfile', agentProfileSchema);