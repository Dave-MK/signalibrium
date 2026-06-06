import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950">
      <SignIn
        appearance={{
          variables: {
            colorBackground: "#0a0a0a",
            colorText: "#f5f5f5",
            colorPrimary: "#10b981",
          },
        }}
      />
    </div>
  );
}
