import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail } from "lucide-react";

const CheckEmail = () => {
  const navigate = useNavigate();
  const email = localStorage.getItem("eleven_email") ?? "your inbox";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex items-center px-6 py-4 border-b border-border">
        <span
          className="font-sans text-lg tracking-widest text-foreground cursor-pointer"
          onClick={() => navigate("/")}
        >
          ELEVENELEVEN
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="max-w-sm w-full"
        >
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-8">
            <Mail className="w-6 h-6 text-muted-foreground" />
          </div>

          <h1 className="font-sans text-3xl md:text-4xl font-light text-foreground mb-3">
            Check your inbox
          </h1>

          <p className="text-muted-foreground text-sm mb-2">
            We sent a sign-in link to
          </p>
          <p className="text-foreground text-sm font-medium mb-8">
            {email}
          </p>

          <p className="text-muted-foreground text-xs leading-relaxed">
            Click the link in the email to verify your account and start weighing in.
            The link expires in 24 hours.
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default CheckEmail;
