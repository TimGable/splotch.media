import { useState } from "react";
import { motion } from "motion/react";
import { ViewportPortal } from "./viewport-portal";

export function ChangePasswordModal({ onClose, onSuccess, isFirstTimeLogin = false }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!isFirstTimeLogin && !currentPassword) {
      setError("current password is required");
      return;
    }

    if (newPassword.length < 8) {
      setError("password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("passwords don't match");
      return;
    }

    setIsSubmitting(true);

    // Simulate API call - will be replaced with Supabase
    await new Promise(resolve => setTimeout(resolve, 1500));

    setIsSubmitting(false);
    onSuccess();
  };

  return (
    <ViewportPortal>
    <motion.div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={!isFirstTimeLogin ? onClose : undefined}
    >
      <motion.div 
        className="bg-black border-2 border-white/20 p-10 max-w-lg w-full mx-4"
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-2xl mb-2 tracking-wide">
          {isFirstTimeLogin ? 'set your password' : 'change password'}
        </h3>
        <p className="text-gray-400 mb-8 tracking-wide text-sm">
          {isFirstTimeLogin 
            ? 'please create a new password for your account' 
            : 'update your account password'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Current Password (only if not first time) */}
          {!isFirstTimeLogin && (
            <div>
              <label className="block text-sm text-gray-400 mb-2 tracking-wide">
                current password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full bg-transparent border-b-2 border-white/20 focus:border-white/60 outline-none py-2 text-base transition-colors tracking-wide"
                disabled={isSubmitting}
                required
              />
            </div>
          )}

          {/* New Password */}
          <div>
            <label className="block text-sm text-gray-400 mb-2 tracking-wide">
              new password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-transparent border-b-2 border-white/20 focus:border-white/60 outline-none py-2 text-base transition-colors tracking-wide"
              placeholder="minimum 8 characters"
              disabled={isSubmitting}
              required
            />
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm text-gray-400 mb-2 tracking-wide">
              confirm new password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-transparent border-b-2 border-white/20 focus:border-white/60 outline-none py-2 text-base transition-colors tracking-wide"
              disabled={isSubmitting}
              required
            />
          </div>

          {/* Error Message */}
          {error && (
            <motion.p 
              className="text-red-400 text-sm tracking-wide"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {error}
            </motion.p>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4 mt-8">
            {!isFirstTimeLogin && (
              <motion.button
                type="button"
                onClick={onClose}
                className="flex-1 px-6 py-4 border border-white/40 hover:border-white/60 hover:bg-white/5 transition-all duration-300 relative group"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={isSubmitting}
              >
                <span className="text-base tracking-wide">cancel</span>
                <motion.div
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-white"
                  initial={{ scaleX: 0 }}
                  whileHover={{ scaleX: 1 }}
                  transition={{ duration: 0.3 }}
                />
              </motion.button>
            )}
            
            <motion.button
              type="submit"
              className={`${isFirstTimeLogin ? 'w-full' : 'flex-1'} px-6 py-4 border-2 border-white hover:bg-white/5 transition-all duration-300 relative overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed`}
              whileHover={!isSubmitting ? { scale: 1.02 } : {}}
              whileTap={!isSubmitting ? { scale: 0.98 } : {}}
              disabled={isSubmitting}
            >
              <motion.div 
                className="absolute inset-0 bg-white"
                initial={{ scaleX: 0 }}
                whileHover={!isSubmitting ? { scaleX: 1 } : {}}
                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                style={{ originX: 0 }}
              />
              <motion.span 
                className="relative z-10 text-base tracking-wide"
              >
                {isSubmitting ? 'updating...' : isFirstTimeLogin ? 'set password' : 'update password'}
              </motion.span>
            </motion.button>
          </div>
        </form>
      </motion.div>
    </motion.div>
    </ViewportPortal>
  );
}
