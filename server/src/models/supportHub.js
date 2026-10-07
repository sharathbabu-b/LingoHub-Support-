const mongoose = require('mongoose');
const { LANGUAGE_CODES, LEVEL_CODES } = require('../lib/meta');
const { SKILLS, CHANNELS, TIERS } = require('../lib/capabilities');

const supportHubSchema = new mongoose.Schema({
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  industry: { type: String, trim: true, maxlength: 80, default: '' },
  companySize: { type: String, trim: true, maxlength: 32, default: '' },
  country: { type: String, trim: true, maxlength: 80, default: '' },
  website: { type: String, trim: true, maxlength: 200, default: '' },
  supportContext: { type: String, trim: true, maxlength: 1000, default: '' },
  languages: { type: [{ code: { type: String, enum: LANGUAGE_CODES }, minLevel: { type: String, enum: LEVEL_CODES, default: 'C1' }, _id: false }], default: [] },
  skills: { type: [String], enum: SKILLS, default: [] },
  requiredSkills: { type: [String], enum: SKILLS, default: [] },
  channels: { type: [String], enum: CHANNELS, default: ['email', 'chat'] },
  tier: { type: String, enum: TIERS, default: 'tier1' },
  ticketVolume: { type: Number, min: 0, max: 100000, default: 0 },
  timezone: { type: String, default: 'UTC' },
  slots: { type: [Number], default: [] },
  maxRate: { type: Number, min: 1, max: 1000, default: null },
  requires24x7: { type: Boolean, default: false },
  status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft', index: true },
}, { timestamps: true });

module.exports = mongoose.model('SupportHub', supportHubSchema);