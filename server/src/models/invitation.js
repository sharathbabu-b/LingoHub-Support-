const mongoose = require('mongoose');
const { LANGUAGE_CODES } = require('../lib/meta');

const invitationSchema = new mongoose.Schema({
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  hub: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportHub', required: true, index: true },
  language: { type: String, enum: LANGUAGE_CODES, required: true },
  slots: { type: [Number], required: true },
  hourlyRate: { type: Number, required: true },
  clientRate: { type: Number, required: true },
  matchScore: { type: Number, min: 0, max: 1 },
  scoreBreakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'expired'], default: 'pending', index: true },
  expiresAt: { type: Date, required: true, index: true },
  respondedAt: Date,
  engagement: { type: mongoose.Schema.Types.ObjectId, ref: 'Engagement' },
}, { timestamps: true });

invitationSchema.index({ status: 1, expiresAt: 1 });
invitationSchema.index({ hub: 1, agent: 1, language: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });

module.exports = mongoose.model('Invitation', invitationSchema);