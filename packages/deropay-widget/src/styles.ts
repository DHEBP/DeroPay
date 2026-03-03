export const CSS = `
:host {
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #f0fdf4;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

.dp-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: #10b981;
  color: #000;
  font-size: 15px;
  font-weight: 700;
  border: none;
  border-radius: 9999px;
  cursor: pointer;
  transition: background 0.15s;
}
.dp-btn:hover { background: #059669; }
.dp-btn svg { flex-shrink: 0; }

.dp-overlay {
  position: fixed;
  inset: 0;
  z-index: 999999;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: dp-fade-in 0.2s ease-out;
}

@keyframes dp-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.dp-modal {
  background: #0a0f0d;
  border: 1px solid #1e2a24;
  border-radius: 16px;
  width: 100%;
  max-width: 400px;
  overflow: hidden;
  animation: dp-slide-up 0.2s ease-out;
}

@keyframes dp-slide-up {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.dp-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #1e2a24;
}

.dp-modal-title {
  font-size: 16px;
  font-weight: 700;
  color: #f0fdf4;
}

.dp-close {
  background: none;
  border: none;
  color: #6b7f75;
  cursor: pointer;
  padding: 4px;
  font-size: 20px;
  line-height: 1;
}
.dp-close:hover { color: #f0fdf4; }

.dp-modal-body {
  padding: 24px 20px;
  text-align: center;
}

.dp-qr {
  background: #ffffff;
  padding: 10px;
  border-radius: 10px;
  display: inline-block;
  margin-bottom: 16px;
}
.dp-qr canvas { display: block; }

.dp-amount-row {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 6px;
  margin-bottom: 4px;
}

.dp-amount-value {
  font-size: 28px;
  font-weight: 900;
  letter-spacing: -0.02em;
  color: #f0fdf4;
}

.dp-amount-label {
  font-size: 14px;
  font-weight: 700;
  color: #10b981;
}

.dp-fiat {
  font-size: 13px;
  color: #6b7f75;
  margin-bottom: 20px;
}

.dp-address-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #6b7f75;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 6px;
  text-align: left;
}

.dp-address-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #000;
  border: 1px solid #1e2a24;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 16px;
}

.dp-address-box code {
  flex: 1;
  font-family: monospace;
  font-size: 10px;
  color: #f0fdf4;
  word-break: break-all;
  line-height: 1.4;
  text-align: left;
}

.dp-copy {
  flex-shrink: 0;
  background: none;
  border: none;
  color: #6b7f75;
  cursor: pointer;
  padding: 4px;
}
.dp-copy:hover { color: #10b981; }

.dp-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(16,185,129,0.14);
  border-radius: 8px;
  margin-bottom: 8px;
}

.dp-status-text {
  font-size: 13px;
  font-weight: 600;
  color: #f0fdf4;
}

.dp-status.confirming { background: rgba(245,158,11,0.14); }
.dp-status.completed { background: rgba(16,185,129,0.2); }

.dp-countdown {
  font-size: 12px;
  color: #4a6356;
}

.dp-success {
  padding: 40px 20px;
  text-align: center;
}

.dp-success-icon {
  width: 56px;
  height: 56px;
  background: #10b981;
  color: #000;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 900;
  margin: 0 auto 12px;
  animation: dp-pop 0.3s ease-out;
}

@keyframes dp-pop {
  0% { transform: scale(0.5); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.dp-success h3 {
  font-size: 18px;
  font-weight: 700;
  color: #f0fdf4;
  margin-bottom: 4px;
}

.dp-success p {
  font-size: 13px;
  color: #6b7f75;
}

.dp-modal-footer {
  padding: 12px 20px;
  border-top: 1px solid #1e2a24;
  text-align: center;
  font-size: 11px;
  color: #4a6356;
}

.dp-modal-footer a {
  color: #10b981;
  text-decoration: none;
}

.dp-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #1e2a24;
  border-top-color: #10b981;
  border-radius: 50%;
  animation: dp-spin 0.8s linear infinite;
  margin: 0 auto 12px;
}

@keyframes dp-spin {
  to { transform: rotate(360deg); }
}

.dp-loading {
  padding: 40px 20px;
  text-align: center;
}

.dp-loading p {
  font-size: 14px;
  color: #6b7f75;
}

.dp-error {
  padding: 32px 20px;
  text-align: center;
}

.dp-error p {
  font-size: 14px;
  color: #ef4444;
}
`;
