const mongoose = require('mongoose');
const { LANGUAGE_CODES } = require('../lib/meta');

const messageSchema = new mongoose.Schema({
  from: { type: String, enum: ['customer', 'agent', 'system'], required: true },
  authorName: String,
  body: { type: String, required: true, maxlength: 10000 },
  at: { type: Date, default: Date.now },
}, { _id: false });

const ticketSchema = new mongoose.Schema({
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  number: { type: Number, index: true },
  customerName: { type: String, required: true },
  customerEmail: { type: String, default: '' },
  language: { type: String, enum: LANGUAGE_CODES, required: true },
  subject: { type: String, required: true, maxlength: 200 },
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
  status: { type: String, enum: ['queued', 'assigned', 'in_progress', 'resolved'], default: 'queued', index: true },
  source: { type: String, enum: ['dashboard', 'api'], default: 'dashboard' },
  messages: { type: [messageSchema], default: [] },
  firstResponseDueAt: Date,
  firstResponseAt: Date,
  assignedAt: Date,
  resolvedAt: Date,
  csat: { type: Number, min: 1, max: 5 },
}, { timestamps: true });

module.exports = mongoose.model('Ticket', ticketSchema);