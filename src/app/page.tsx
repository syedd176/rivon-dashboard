import { redirect } from "next/navigation";

export default function Home() {
  // Channels is the only screen so far. The dashboard shell comes later.
  redirect("/channels");
}
