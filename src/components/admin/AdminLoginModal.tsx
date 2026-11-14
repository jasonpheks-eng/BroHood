import React, { useState } from 'react';
import { Lock, X, Check, ShieldAlert } from 'lucide-react';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim() === 'bro4life') {
      try {
        sessionStorage.setItem('brotherhood_admin_unlocked', 'true');
      } catch {}
      setError(false);
      setPassword('');
      onSuccess();
    } else {
      setError(true);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md bg-white border border-zinc-200 p-6 md:p-8 shadow-2xl rounded-none text-black animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-black transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-black text-white flex items-center justify-center shrink-0">
            <Lock size={18} />
          </div>
          <div>
            <h3 className="text-base font-black uppercase tracking-tight">Admin Authentication</h3>
            <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mt-0.5">
              Secure Management Console
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-1.5">
              Admin Password
            </label>
            <input
              type="password"
              required
              autoFocus
              placeholder="Enter admin password..."
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(false);
              }}
              className="w-full border border-zinc-300 p-3 text-xs font-mono tracking-widest focus:outline-none focus:border-black bg-zinc-50"
            />
            {error && (
              <p className="flex items-center gap-1.5 text-[10px] font-bold text-rose-600 mt-1.5 uppercase">
                <ShieldAlert size={12} /> Incorrect password. Try again.
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-black"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-black text-white hover:bg-zinc-800 px-6 py-2.5 text-xs font-black uppercase tracking-[0.2em] transition-colors flex items-center gap-2 shadow-md"
            >
              <Check size={14} /> Unlock Admin
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
