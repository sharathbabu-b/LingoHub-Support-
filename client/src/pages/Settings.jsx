import { useEffect, useState } from 'react';
import { api } from '../api';
import { useNotifications } from '../components/Notifications';

export default function Settings() {
  const { notify } = useNotifications();
  const [s, setS] = useState(null);
  const [sla, setSla] = useState(15);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/client/settings')
      .then((r) => {
        setS(r);
        setSla(r.slaMinutes);
      })
      .catch((e) => setErr(e.message));
  }, []);

  const wrap = async (fn) => {
    setErr('');
    try {
      await fn();
    } catch (e) {
      setErr(e.message);
    }
  };

  const origin = window.location.origin;
  const key = s ? s.apiKey : 'YOUR_API_KEY';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Integration & SLA</h1>
          <div className="muted">Push tickets from your own product or helpdesk, and set your response-time target.</div>
        </div>
      </div>
      {err && <div className="alert">{err}</div>}

      <div className="card">
        <h2>First-response SLA</h2>
        <div className="row">
          <input type="number" min="1" max="1440" value={sla} onChange={(e) => setSla(Number(e.target.value))} style={{ width: 100 }} />
          <span>minutes (normal priority; urgent = ½, high = ¾, low = 2×)</span>
          <button
            onClick={() =>
              wrap(async () => {
                await api('/client/settings', { method: 'PUT', body: { slaMinutes: sla } });
                notify('SLA saved. It applies to new tickets.');
              })
            }
          >
            Save
          </button>
        </div>
      </div>

      <div className="card">
        <h2>API key</h2>
        <pre>{key}</pre>
        <button
          className="danger"
          onClick={() => {
            if (!window.confirm('Rotate the key? Integrations using the old key stop working immediately.')) return;
            wrap(async () => {
              const r = await api('/client/rotate-key', { method: 'POST' });
              setS({ ...s, apiKey: r.apiKey });
              notify('New API key generated.');
            });
          }}
        >
          Rotate key
        </button>
      </div>

      <div className="card">
        <h2>Create a ticket from your app</h2>
        <p className="muted small-text">Tickets are routed to a native-language agent who is on shift right now; otherwise they wait in the queue and are picked up when a matching shift starts.</p>
        <pre>{`curl -X POST ${origin}/api/v1/tickets \\
  -H "x-api-key: ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "customerName": "Hans Müller",
    "customerEmail": "hans@example.com",
    "language": "de",
    "subject": "Rechnung nicht erhalten",
    "priority": "normal",
    "message": "Ich habe meine Rechnung für März nicht erhalten."
  }'`}</pre>
        <h3>Other endpoints</h3>
        <pre>{`GET  ${origin}/api/v1/tickets/:number          # status, SLA state and messages
POST ${origin}/api/v1/tickets/:number/reply    # {"message": "..."}  customer follow-up`}</pre>
        <p className="muted small-text">Language codes: en, de, fr, es, it, pt, nl, pl, ro, sv, ru, uk, tr, ja, ko, zh, hi, ta, te, bn, th, vi, id, ms, fil, ar.</p>
      </div>
    </>
  );
}
