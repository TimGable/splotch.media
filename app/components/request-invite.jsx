import { useState } from "react";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import { InteractiveBackground } from "./interactive-background";

export function RequestInvite({ onBack }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitWarning, setSubmitWarning] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!email || !message) return;

    setIsSubmitting(true);
    setSubmitError("");
    setSubmitWarning("");

    try {
      const response = await fetch("/api/invite-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          message,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to submit invite request.");
      }

      if (data?.notificationError) {
        setSubmitWarning(
          `Your request was saved, but the owner notification email failed: ${data.notificationError}`,
        );
      }

      setIsSubmitted(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to submit invite request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      <div className="relative min-h-screen flex items-center justify-center">
        <InteractiveBackground />

        <div className="relative z-10 w-full max-w-2xl px-4 md:px-6">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="border border-white/20 bg-black/55 p-6 backdrop-blur-sm md:p-10"
          >
            <motion.button
              onClick={onBack}
              className="mb-8 text-gray-400 transition-colors hover:text-white"
              whileHover={{ x: -5 }}
              whileTap={{ scale: 0.95 }}
              disabled={isSubmitting}
            >
              <span aria-hidden="true">{"\u2190"}</span>
              <span className="ml-2">back</span>
            </motion.button>

            {!isSubmitted ? (
              <>
                <div className="mb-8">
                  <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-gray-500">
                    invite access
                  </p>
                  <h1 className="text-3xl md:text-5xl">request an invite</h1>
                  <p className="mt-4 max-w-2xl text-sm leading-relaxed text-gray-400 md:text-base">
                    Tell us who you are and why you want access. If a previous request stalled or never
                    reached you, submitting a new one with the same email will replace the older pending request.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="mb-2 block text-sm tracking-wide text-gray-400">
                      email address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="w-full border border-white/20 bg-transparent px-4 py-3 text-base text-white outline-none transition-colors hover:border-white/40 focus:border-white/60"
                      placeholder="you@example.com"
                      required
                      disabled={isSubmitting}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm tracking-wide text-gray-400">
                      why do you want to join?
                    </label>
                    <textarea
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      className="min-h-48 w-full resize-none border border-white/20 bg-transparent px-4 py-3 text-base text-white outline-none transition-colors hover:border-white/40 focus:border-white/60"
                      placeholder="Share what you make, what kind of archive presence you want, or why this platform fits your work."
                      required
                      disabled={isSubmitting}
                    />
                  </div>

                  <motion.button
                    type="submit"
                    disabled={isSubmitting || !email || !message}
                    className="w-full border-2 border-white px-6 py-4 transition-all duration-300 disabled:border-white/20 disabled:text-gray-500"
                    whileHover={!isSubmitting ? { scale: 1.01 } : {}}
                    whileTap={!isSubmitting ? { scale: 0.98 } : {}}
                  >
                    <span className="text-base tracking-wide">
                      {isSubmitting ? "submitting..." : "submit request"}
                    </span>
                  </motion.button>

                  {submitError && (
                    <div className="border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                      {submitError}
                    </div>
                  )}

                  {submitWarning && (
                    <div className="border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
                      {submitWarning}
                    </div>
                  )}
                </form>
              </>
            ) : (
              <div className="text-center">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-white/30">
                  <Check className="h-7 w-7" />
                </div>

                <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-gray-500">
                  request sent
                </p>
                <h2 className="text-3xl md:text-4xl">request submitted</h2>
                <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-gray-400 md:text-base">
                  We&apos;ll review your request and contact you by email if it is approved. If you had an older pending request, this one replaced it.
                </p>

                {submitWarning && (
                  <div className="mx-auto mt-6 max-w-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
                    {submitWarning}
                  </div>
                )}

                <motion.button
                  onClick={onBack}
                  className="mt-8 border border-white/30 px-6 py-3 text-sm tracking-wide transition-colors hover:border-white/50 hover:bg-white/10"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  back
                </motion.button>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
