import SignInForm from "./SignInForm";

export default function SignInPage({ searchParams }: { searchParams: { next?: string } }) {
  return <SignInForm nextUrl={searchParams?.next ?? "/app"} />;
}
