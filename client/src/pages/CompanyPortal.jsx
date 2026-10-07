import AuthForm from '../components/AuthForm';

export function CompanyLogin() {
  return <AuthForm role="client" mode="login" signInPath="/company/login" registerPath="/company/register" />;
}

export function CompanyRegistration() {
  return <AuthForm role="client" mode="register" signInPath="/company/login" registerPath="/company/register" />;
}