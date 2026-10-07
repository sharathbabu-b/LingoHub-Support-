import AuthForm from '../components/AuthForm';

export function AgentLogin() {
  return <AuthForm role="agent" mode="login" signInPath="/agent/login" registerPath="/agent/register" />;
}

export function AgentRegistration() {
  return <AuthForm role="agent" mode="register" signInPath="/agent/login" registerPath="/agent/register" />;
}