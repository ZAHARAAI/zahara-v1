import { redirect } from "next/navigation";

const Job5Layout = ({ children }: { children: React.ReactNode }) => {
  if (process.env.JOB5_ENABLED !== "true") redirect("/");

  return children;
};

export default Job5Layout;
