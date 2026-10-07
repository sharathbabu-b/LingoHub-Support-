const mongoose = require('mongoose');
const { LANGUAGE_CODES } = require('../lib/meta');

const engagementSchema = new mongoose.Schema({
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  hub: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportHub', default: null, index: true },
  language: { type: String, enum: LANGUAGE_CODES, required: true },
  slots: { type: [Number], default: [] },
  hourlyRate: { type: Number, required: true },
  clientRate: { type: Number, required: true },
  status: { type: String, enum: ['active', 'ended'], default: 'active', index: true },
  endedAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('Engagement', engagementSchema);