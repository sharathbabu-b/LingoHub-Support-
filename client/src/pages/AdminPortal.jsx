import AuthForm from '../components/AuthForm';

export default function AdminPortal() {
  return <AuthForm role="admin" mode="login" signInPath="/admin/login" registerPath="/admin/login" />;
}