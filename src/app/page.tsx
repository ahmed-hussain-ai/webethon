import { redirect } from "next/navigation";

// Logged-in users are forwarded from /login to their dashboard.
export default function Home() {
  redirect("/login");
}
