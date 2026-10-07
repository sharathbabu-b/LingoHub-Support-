import { Link } from 'react-router-dom';

// Describes what this software actually does with data. The operator must have it reviewed by counsel and
// add their legal entity and contact details before going live (GDPR Art. 13 requires the controller's identity).
export default function Privacy() {
  return (
    <div className="auth" style={{ alignItems: 'start' }}>
      <div className="card" style={{ maxWidth: 720 }}>
        <p>
          <Link to="/">← Back</Link>
        </p>
        <h1>Privacy Notice</h1>
        <p className="muted small-text">Applies to this LingoHub service. The operator of this deployment is the data controller for account data and must add their legal name and contact details here before launch.</p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <b>Account data:</b> name, email address, role, company (clients), and a one-way hash of your password. We never store your password itself.
          </li>
          <li>
            <b>Agents:</b> headline, bio, languages and proficiency, skills, experience, supported channels and tiers, hourly rate, time zone and weekly availability, ratings received, invitations and the clients you work with.
          </li>
          <li>
            <b>Clients:</b> company and Support Hub requirements (languages, skills, channels, tier, context and hours), agent invitations, hired agents, billing totals, API key, and support tickets, which include <b>your customers' names, email addresses and message contents</b>. For that ticket data you are the controller and we act as your processor; a data processing agreement should be in place.
          </li>
          <li>
            <b>Technical data:</b> your IP address is used transiently for rate limiting and security. We do not use analytics or advertising trackers, and set no cookies.
          </li>
        </ul>

        <h2>Why we use it</h2>
        <p>To provide the service: authenticating you, matching clients with agents, routing and answering tickets, billing, and keeping the platform secure. We do not sell personal data.</p>

        <h2>AI requirement drafts</h2>
        <p>When a client chooses the AI Requirement Assistant, the text they enter is sent to the AI provider configured by the service operator to draft structured support requirements. The draft is validated and shown for review; it is not saved or used to run matching until the client confirms by continuing through the matching flow. Do not include customer personal data, credentials, or other sensitive information in the prompt. The operator must document the configured provider and its retention terms before enabling this feature in production.</p>

        <h2>Browser storage</h2>
        <p>After you sign in, a session token is kept in your browser's local storage so you stay signed in (strictly necessary). It expires automatically and is removed when you sign out.</p>

        <h2>Who sees what</h2>
        <p>Clients see the name, languages, rating and rate of agents matched to them. Agents see the tickets assigned to them and the company name of the client. Administrators can see account and agent profile data to verify agents.</p>

        <h2>Retention</h2>
        <p>Data is kept while your account exists. Deleting your account erases it: a client's tickets, plans, Support Hubs, invitations and engagements are deleted; an agent's profile and invitations are deleted, active engagements end, and their name is removed from past conversations.</p>

        <h2>Your rights</h2>
        <p>
          You can download all your data and delete your account at any time from <b>Account</b> in the app (access, portability and erasure). You can correct your details by editing your profile. You may also object to or request restriction of processing, and complain to your data protection authority. Contact the operator for any of these.
        </p>

        <h2>Security</h2>
        <p>Passwords are hashed with bcrypt, sessions use signed expiring tokens that can be revoked ("sign out everywhere"), traffic should be served over HTTPS, and sign-in attempts are rate limited.</p>
      </div>
    </div>
  );
}
