const CART_STORAGE_KEY = 'crumbWorksCart';
const LEGACY_CART_STORAGE_KEY = ['baked', 'By', 'MadyCart'].join('');

const emptyEl = document.getElementById('cart-empty');
const contentEl = document.getElementById('cart-content');
const itemsEl = document.getElementById('cart-items');
const totalEl = document.getElementById('cart-total');
const clearCartButton = document.getElementById('clear-cart-button');
const checkoutButton = document.getElementById('cart-checkout-button');
const checkoutStatus = document.getElementById('cart-checkout-status');
const discountCodeInput = document.getElementById('checkout-discount-code');
const discountApplyButton = document.getElementById('checkout-discount-apply');
const discountStatus = document.getElementById('checkout-discount-status');
const loyaltyPanel = document.getElementById('checkout-loyalty-panel');
const loyaltySummary = document.getElementById('checkout-loyalty-summary');
const loyaltyAmountInput = document.getElementById('checkout-loyalty-amount');
const loyaltyUseMaxButton = document.getElementById('checkout-loyalty-use-max');
const loyaltyRemoveButton = document.getElementById('checkout-loyalty-remove');
const loyaltyStatus = document.getElementById('checkout-loyalty-status');
const CHECKOUT_DRAFT_KEY = 'crumbWorksCheckoutDraft';
const LEGACY_CHECKOUT_DRAFT_KEY = ['baked', 'By', 'MadyCheckoutDraft'].join('');
const CHECKOUT_CUSTOMER_KEY = 'crumbWorksCheckoutCustomer';
const LEGACY_CHECKOUT_CUSTOMER_KEY = ['baked', 'By', 'MadyCheckoutCustomer'].join('');
const customerNameInput = document.getElementById('checkout-customer-name');
const customerEmailInput = document.getElementById('checkout-customer-email');
const customerPhoneInput = document.getElementById('checkout-customer-phone');
const customerDateInput = document.getElementById('checkout-customer-date');
const customerMethodInput = document.getElementById('checkout-customer-method');
const fulfilmentDetailsEl = document.getElementById('checkout-fulfilment-details');
let customerAddressLine1Input = null;
let customerAddressLine2Input = null;
let customerPostcodeInput = null;
let customerDeliveryAddressError = null;
const customerNotesInput = document.getElementById('checkout-customer-notes');
const customerAllergiesInput = document.getElementById('checkout-customer-allergies');
const marketingOptInInput = document.getElementById('checkout-marketing-opt-in');
const checkoutTermsAcceptedInput = document.getElementById('checkout-terms-accepted');
const checkoutAllergenAcknowledgedInput = document.getElementById('checkout-allergen-acknowledged');
const enquireOnlyProductSlugs = (() => {
  if (!(contentEl instanceof HTMLElement)) return new Set();

  try {
    const parsed = JSON.parse(contentEl.dataset.enquireOnlyProducts || '[]');
    return new Set(Array.isArray(parsed) ? parsed.map((item) => String(item)) : []);
  } catch {
    return new Set();
  }
})();
const accountEmail = contentEl instanceof HTMLElement ? String(contentEl.dataset.accountEmail || '').trim().toLowerCase() : '';
const hasVerifiedAccount = contentEl instanceof HTMLElement && contentEl.dataset.hasAccount === 'true';
let appliedDiscount = null;
let loyaltyBalance = null;
let appliedLoyaltyPence = 0;
let fulfilment = 'collection';
let deliveryAddressDraft = {
  line1: '',
  line2: '',
  postcode: ''
};

const formatMoney = (pence) => {
  const amount = Number(pence || 0) / 100;
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
};

const readCart = () => {
  try {
    const storedCart = localStorage.getItem(CART_STORAGE_KEY) || localStorage.getItem(LEGACY_CART_STORAGE_KEY) || '[]';
    const parsed = JSON.parse(storedCart);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeCart = (items) => {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  localStorage.removeItem(LEGACY_CART_STORAGE_KEY);
};

const pruneEnquireOnlyCartItems = () => {
  const cartItems = readCart();

  if (!enquireOnlyProductSlugs.size) {
    return { items: cartItems, removed: [] };
  }

  const removed = [];
  const items = cartItems.filter((item) => {
    const blocked = enquireOnlyProductSlugs.has(String(item.productId || ''));
    if (blocked) {
      removed.push(item.productName || 'This product');
    }
    return !blocked;
  });

  if (removed.length !== 0) {
    writeCart(items);
  }

  return { items, removed };
};

const readCheckoutCustomer = () => {
  try {
    const storedCustomer = localStorage.getItem(CHECKOUT_CUSTOMER_KEY) || localStorage.getItem(LEGACY_CHECKOUT_CUSTOMER_KEY) || '{}';
    const parsed = JSON.parse(storedCustomer);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeCheckoutCustomer = (customer) => {
  localStorage.setItem(CHECKOUT_CUSTOMER_KEY, JSON.stringify(customer));
  localStorage.removeItem(LEGACY_CHECKOUT_CUSTOMER_KEY);
};

const showCheckoutStatus = (message, type = 'info') => {
  if (!(checkoutStatus instanceof HTMLElement)) return;
  checkoutStatus.textContent = message;
  checkoutStatus.classList.remove(
    'hidden',
    'border-emerald-200',
    'bg-emerald-50',
    'text-emerald-800',
    'border-rose-200',
    'bg-rose-50',
    'text-rose-700',
    'border-[#f4c8d9]',
    'bg-[#fff7fa]',
    'text-[var(--brand-ink-soft)]'
  );

  if (type === 'success') {
    checkoutStatus.classList.add('border-emerald-200', 'bg-emerald-50', 'text-emerald-800');
    return;
  }

  if (type === 'error') {
    checkoutStatus.classList.add('border-rose-200', 'bg-rose-50', 'text-rose-700');
    return;
  }

  checkoutStatus.classList.add('border-[#f4c8d9]', 'bg-[#fff7fa]', 'text-[var(--brand-ink-soft)]');
};

const hideCheckoutStatus = () => {
  if (!(checkoutStatus instanceof HTMLElement)) return;
  checkoutStatus.textContent = '';
  checkoutStatus.classList.add('hidden');
};

const showDiscountStatus = (message, type = 'info') => {
  if (!(discountStatus instanceof HTMLElement)) return;
  discountStatus.textContent = message;
  discountStatus.classList.remove(
    'hidden',
    'border-emerald-200',
    'bg-emerald-50',
    'text-emerald-800',
    'border-rose-200',
    'bg-rose-50',
    'text-rose-700',
    'border-[#f4c8d9]',
    'bg-[#fff7fa]',
    'text-[var(--brand-ink-soft)]'
  );

  if (type === 'success') {
    discountStatus.classList.add('border-emerald-200', 'bg-emerald-50', 'text-emerald-800');
    return;
  }

  if (type === 'error') {
    discountStatus.classList.add('border-rose-200', 'bg-rose-50', 'text-rose-700');
    return;
  }

  discountStatus.classList.add('border-[#f4c8d9]', 'bg-[#fff7fa]', 'text-[var(--brand-ink-soft)]');
};

const clearAppliedDiscount = (message = '') => {
  appliedDiscount = null;
  if (message) {
    showDiscountStatus(message, 'info');
  } else if (discountStatus instanceof HTMLElement) {
    discountStatus.textContent = '';
    discountStatus.classList.add('hidden');
  }
  renderCart();
};

const normaliseQuantity = (value) => {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity < 1) return 1;
  if (quantity > 99) return 99;
  return Math.floor(quantity);
};

const normaliseFulfilment = (value) => String(value || '').trim().toLowerCase() === 'delivery' ? 'delivery' : 'collection';

const isDeliverySelected = () => fulfilment === 'delivery';

const syncDeliveryAddressDraft = () => {
  if (customerAddressLine1Input instanceof HTMLInputElement) {
    deliveryAddressDraft.line1 = customerAddressLine1Input.value;
  }
  if (customerAddressLine2Input instanceof HTMLInputElement) {
    deliveryAddressDraft.line2 = customerAddressLine2Input.value;
  }
  if (customerPostcodeInput instanceof HTMLInputElement) {
    deliveryAddressDraft.postcode = customerPostcodeInput.value;
  }
};

const showLoyaltyStatus = (message, type = 'info') => {
  if (!(loyaltyStatus instanceof HTMLElement)) return;
  loyaltyStatus.textContent = message;
  loyaltyStatus.classList.remove('hidden', 'border-emerald-200', 'bg-emerald-50', 'text-emerald-800', 'border-rose-200', 'bg-rose-50', 'text-rose-700', 'border-[#f4c8d9]', 'bg-[#fff7fa]', 'text-[var(--brand-ink-soft)]');
  if (type === 'success') {
    loyaltyStatus.classList.add('border-emerald-200', 'bg-emerald-50', 'text-emerald-800');
  } else if (type === 'error') {
    loyaltyStatus.classList.add('border-rose-200', 'bg-rose-50', 'text-rose-700');
  } else {
    loyaltyStatus.classList.add('border-[#f4c8d9]', 'bg-[#fff7fa]', 'text-[var(--brand-ink-soft)]');
  }
};

const hideLoyaltyStatus = () => {
  if (!(loyaltyStatus instanceof HTMLElement)) return;
  loyaltyStatus.textContent = '';
  loyaltyStatus.classList.add('hidden');
};

const bindDeliveryAddressInputs = () => {
  customerAddressLine1Input = document.getElementById('checkout-customer-address-line-1');
  customerAddressLine2Input = document.getElementById('checkout-customer-address-line-2');
  customerPostcodeInput = document.getElementById('checkout-customer-postcode');
  customerDeliveryAddressError = document.getElementById('checkout-delivery-address-error');

  if (customerAddressLine1Input instanceof HTMLInputElement) {
    customerAddressLine1Input.value = deliveryAddressDraft.line1;
    customerAddressLine1Input.required = true;
  }
  if (customerAddressLine2Input instanceof HTMLInputElement) {
    customerAddressLine2Input.value = deliveryAddressDraft.line2;
  }
  if (customerPostcodeInput instanceof HTMLInputElement) {
    customerPostcodeInput.value = deliveryAddressDraft.postcode;
    customerPostcodeInput.required = true;
  }

  [customerAddressLine1Input, customerAddressLine2Input, customerPostcodeInput].forEach((field) => field?.addEventListener('input', () => {
    syncDeliveryAddressDraft();
    persistCheckoutCustomer();
    if (!getDeliveryAddressError()) {
      setDeliveryAddressError();
    }
  }));
};

const renderFulfilmentDetails = () => {
  if (!(fulfilmentDetailsEl instanceof HTMLElement)) return;

  syncDeliveryAddressDraft();

  if (fulfilment === 'delivery') {
    fulfilmentDetailsEl.innerHTML = `
      <div id="checkout-delivery-address-field" class="premium-field">
        <span class="font-medium">Delivery address</span>
        <div class="delivery-address-grid">
          <label class="premium-field">
            <span class="font-medium">Address line 1</span>
            <input id="checkout-customer-address-line-1" type="text" class="input-shell" autocomplete="address-line1" placeholder="House number and street" aria-describedby="checkout-delivery-address-error" />
          </label>
          <label class="premium-field">
            <span class="font-medium">Address line 2</span>
            <input id="checkout-customer-address-line-2" type="text" class="input-shell" autocomplete="address-line2" placeholder="Apartment, suite, building or area" />
          </label>
          <label class="premium-field delivery-address-grid__postcode">
            <span class="font-medium">Postcode</span>
            <input id="checkout-customer-postcode" type="text" class="input-shell uppercase" autocomplete="postal-code" placeholder="B1 1AA" aria-describedby="checkout-delivery-address-error" />
          </label>
        </div>
        <span id="checkout-delivery-address-error" class="hidden text-sm text-rose-700" role="alert"></span>
      </div>
    `;
    bindDeliveryAddressInputs();
    return;
  }

  fulfilmentDetailsEl.innerHTML = `
    <div id="checkout-collection-panel" class="collection-info-panel">
      <p>Collection from our Birmingham City Centre Hub.</p>
    </div>
  `;
  customerAddressLine1Input = null;
  customerAddressLine2Input = null;
  customerPostcodeInput = null;
  customerDeliveryAddressError = null;
};

const normaliseAddressPart = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const buildDeliveryAddress = () => {
  const line1 = customerAddressLine1Input instanceof HTMLInputElement ? normaliseAddressPart(customerAddressLine1Input.value) : normaliseAddressPart(deliveryAddressDraft.line1);
  const line2 = customerAddressLine2Input instanceof HTMLInputElement ? normaliseAddressPart(customerAddressLine2Input.value) : normaliseAddressPart(deliveryAddressDraft.line2);
  const postcode = customerPostcodeInput instanceof HTMLInputElement ? normaliseAddressPart(customerPostcodeInput.value).toUpperCase() : normaliseAddressPart(deliveryAddressDraft.postcode).toUpperCase();

  return [line1, line2, postcode].filter(Boolean).join(', ');
};

const splitStoredDeliveryAddress = (value) => {
  const parts = String(value || '').split(',').map((part) => normaliseAddressPart(part)).filter(Boolean);

  return {
    line1: parts[0] || '',
    line2: parts.length > 2 ? parts.slice(1, -1).join(', ') : '',
    postcode: parts.length > 1 ? parts[parts.length - 1] : ''
  };
};

const isValidPostcode = (value) => {
  const postcode = normaliseAddressPart(value).toUpperCase();
  return postcode.length >= 5 && postcode.length <= 10 && /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(postcode);
};

const getDeliveryAddressError = () => {
  const line1 = customerAddressLine1Input instanceof HTMLInputElement ? normaliseAddressPart(customerAddressLine1Input.value) : '';
  const postcode = customerPostcodeInput instanceof HTMLInputElement ? normaliseAddressPart(customerPostcodeInput.value) : '';

  if (!line1) return 'Please enter address line 1 for delivery.';
  if (!postcode) return 'Please enter a postcode for delivery.';
  if (line1.length < 5) return 'Please enter a fuller address line 1 for delivery.';
  if (!isValidPostcode(postcode)) return 'Please enter a valid UK postcode for delivery.';

  return '';
};

const setDeliveryAddressError = (message = '') => {
  [customerAddressLine1Input, customerPostcodeInput].forEach((field) => {
    if (field instanceof HTMLInputElement) {
      field.setAttribute('aria-invalid', message ? 'true' : 'false');
    }
  });

  if (customerAddressLine2Input instanceof HTMLInputElement) {
    customerAddressLine2Input.setAttribute('aria-invalid', 'false');
  }

  if (!(customerDeliveryAddressError instanceof HTMLElement)) return;
  customerDeliveryAddressError.textContent = message;
  customerDeliveryAddressError.classList.toggle('hidden', !message);
};

const updateCartItemQuantity = (lineId, nextQuantity) => {
  const updatedCart = readCart().map((item) => item.lineId === lineId ? { ...item, quantity: normaliseQuantity(nextQuantity) } : item);
  writeCart(updatedCart);
  if (appliedDiscount) {
    appliedDiscount = null;
    showDiscountStatus('Discount removed because your cart changed. Apply the code again to use it.', 'info');
  }
  renderCart();
};

const removeCartItem = (lineId) => {
  writeCart(readCart().filter((item) => item.lineId !== lineId));
  if (appliedDiscount) {
    appliedDiscount = null;
    showDiscountStatus('Discount removed because your cart changed. Apply the code again to use it.', 'info');
  }
  renderCart();
};

const getCartSubtotalPence = (items = readCart()) => items.reduce((total, item) => total + Number(item.pricePence || 0) * normaliseQuantity(item.quantity), 0);
const getDiscountedSubtotalPence = (items = readCart()) => Math.max(0, getCartSubtotalPence(items) - (appliedDiscount?.discountAmountPence || 0));
const getMaxLoyaltyPence = (items = readCart()) => Math.max(0, Math.min(loyaltyBalance?.redeemablePence || 0, getDiscountedSubtotalPence(items) - 100));

const clampAppliedLoyalty = (items = readCart()) => {
  const max = getMaxLoyaltyPence(items);
  if (appliedLoyaltyPence > max) appliedLoyaltyPence = max;
  if (appliedLoyaltyPence < 0) appliedLoyaltyPence = 0;
};

const updateLoyaltyPanel = (items = readCart()) => {
  if (!(loyaltyPanel instanceof HTMLElement)) return;
  const max = getMaxLoyaltyPence(items);
  const shouldShow = hasVerifiedAccount && (loyaltyBalance?.redeemablePence || 0) > 0 && getCartSubtotalPence(items) > 0 && max > 0;
  loyaltyPanel.classList.toggle('hidden', !shouldShow);
  if (!shouldShow) {
    appliedLoyaltyPence = 0;
    return;
  }

  if (loyaltySummary instanceof HTMLElement) {
    loyaltySummary.textContent = `You have ${loyaltyBalance.redeemablePence} points, worth ${formatMoney(loyaltyBalance.redeemablePence)}. Apply up to ${formatMoney(max)} while leaving at least £1.00 payable.`;
  }
  if (loyaltyAmountInput instanceof HTMLInputElement) {
    loyaltyAmountInput.max = String(max / 100);
    loyaltyAmountInput.value = appliedLoyaltyPence > 0 ? (appliedLoyaltyPence / 100).toFixed(2) : '';
  }
};

const loadLoyaltyBalance = async () => {
  if (!hasVerifiedAccount) return;
  try {
    const response = await fetch('/api/account/loyalty', { headers: { Accept: 'application/json' } });
    if (!response.ok) return;
    loyaltyBalance = await response.json();
    renderCart();
  } catch {
    loyaltyBalance = null;
  }
};

const applyLoyaltyAmount = (amountPence) => {
  appliedLoyaltyPence = Math.max(0, Math.trunc(amountPence));
  clampAppliedLoyalty();
  if (appliedLoyaltyPence > 0) {
    showLoyaltyStatus(`${formatMoney(appliedLoyaltyPence)} in Loyalty Points applied.`, 'success');
  } else {
    hideLoyaltyStatus();
  }
  renderCart();
};

const buildCheckoutPayload = (items) => {
  const normalisedItems = items.map((item) => {
    const quantity = normaliseQuantity(item.quantity);
    const unitPricePence = Number(item.pricePence || 0);

    return {
      lineId: item.lineId,
      productId: item.productId || '',
      name: item.productName || 'Product',
      category: item.category || '',
      flavour: item.flavour || '',
      servingSize: item.servingSize || '',
      quantity,
      unitPricePence,
      lineTotalPence: unitPricePence * quantity,
      imageUrl: item.imageUrl || ''
    };
  });

  const subtotalPence = normalisedItems.reduce((total, item) => total + item.lineTotalPence, 0);
  const discountAmountPence = appliedDiscount?.discountAmountPence || 0;
  const loyaltyRedeemPence = Math.max(0, Math.trunc(appliedLoyaltyPence));

  return {
    currency: 'GBP',
    cartId: `bbm-${Date.now()}`,
    source: 'cart',
    customer: {
      name: customerNameInput instanceof HTMLInputElement ? customerNameInput.value.trim() : '',
      email: customerEmailInput instanceof HTMLInputElement ? customerEmailInput.value.trim() : '',
      phone: customerPhoneInput instanceof HTMLInputElement ? customerPhoneInput.value.trim() : '',
      marketingOptIn: marketingOptInInput instanceof HTMLInputElement && marketingOptInInput.checked,
      fulfilmentMethod: fulfilment,
      requestedDate: customerDateInput instanceof HTMLInputElement ? customerDateInput.value.trim() : '',
      deliveryAddress: isDeliverySelected() ? buildDeliveryAddress() : '',
      deliveryAddressLine1: customerAddressLine1Input instanceof HTMLInputElement ? customerAddressLine1Input.value.trim() : '',
      deliveryAddressLine2: customerAddressLine2Input instanceof HTMLInputElement ? customerAddressLine2Input.value.trim() : '',
      deliveryPostcode: customerPostcodeInput instanceof HTMLInputElement ? customerPostcodeInput.value.trim().toUpperCase() : '',
      notes: customerNotesInput instanceof HTMLTextAreaElement ? customerNotesInput.value.trim() : '',
      allergies: customerAllergiesInput instanceof HTMLTextAreaElement ? customerAllergiesInput.value.trim() : ''
    },
    items: normalisedItems,
    subtotalPence,
    loyaltyRedeemPence,
    totalPence: Math.max(0, subtotalPence - discountAmountPence - loyaltyRedeemPence),
    discountCode: appliedDiscount?.discountCode || ''
  };
};

const persistCheckoutDraft = (payload) => {
  localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(payload));
  localStorage.removeItem(LEGACY_CHECKOUT_DRAFT_KEY);
};

const validateCheckoutCustomer = () => {
  const name = customerNameInput instanceof HTMLInputElement ? customerNameInput.value.trim() : '';
  const email = customerEmailInput instanceof HTMLInputElement ? customerEmailInput.value.trim() : '';
  const phone = customerPhoneInput instanceof HTMLInputElement ? customerPhoneInput.value.trim() : '';
  const requestedDate = customerDateInput instanceof HTMLInputElement ? customerDateInput.value.trim() : '';
  const termsAccepted = checkoutTermsAcceptedInput instanceof HTMLInputElement ? checkoutTermsAcceptedInput.checked : false;
  const allergenAcknowledged = checkoutAllergenAcknowledgedInput instanceof HTMLInputElement ? checkoutAllergenAcknowledgedInput.checked : false;

  if (!name || !email || !phone || !requestedDate) {
    return 'Add your name, email, phone number, and preferred collection or delivery date before checkout.';
  }

  if (isDeliverySelected()) {
    const message = getDeliveryAddressError();
    if (message) {
      setDeliveryAddressError(message);
      if (!normaliseAddressPart(customerAddressLine1Input?.value)) {
        customerAddressLine1Input?.focus();
      } else {
        customerPostcodeInput?.focus();
      }
      return message;
    }

    setDeliveryAddressError();
  } else {
    setDeliveryAddressError();
  }

  if (!termsAccepted) {
    return 'Please confirm that you have read and agree to The Crumb Works Terms & Conditions before continuing.';
  }

  if (!allergenAcknowledged) {
    return 'Please confirm that you understand allergen information should be provided before placing an order.';
  }

  return '';
};

const persistCheckoutCustomer = () => {
  writeCheckoutCustomer({
    name: customerNameInput instanceof HTMLInputElement ? customerNameInput.value : '',
    email: customerEmailInput instanceof HTMLInputElement ? customerEmailInput.value : '',
    phone: customerPhoneInput instanceof HTMLInputElement ? customerPhoneInput.value : '',
    requestedDate: customerDateInput instanceof HTMLInputElement ? customerDateInput.value : '',
    fulfilmentMethod: fulfilment,
    deliveryAddress: buildDeliveryAddress(),
    deliveryAddressLine1: customerAddressLine1Input instanceof HTMLInputElement ? customerAddressLine1Input.value : '',
    deliveryAddressLine2: customerAddressLine2Input instanceof HTMLInputElement ? customerAddressLine2Input.value : '',
    deliveryPostcode: customerPostcodeInput instanceof HTMLInputElement ? customerPostcodeInput.value : '',
    notes: customerNotesInput instanceof HTMLTextAreaElement ? customerNotesInput.value : '',
    allergies: customerAllergiesInput instanceof HTMLTextAreaElement ? customerAllergiesInput.value : '',
    marketingOptIn: marketingOptInInput instanceof HTMLInputElement && marketingOptInInput.checked
  });
};

const hydrateCheckoutCustomer = () => {
  const customer = readCheckoutCustomer();

  if (customerNameInput instanceof HTMLInputElement) customerNameInput.value = typeof customer.name === 'string' ? customer.name : '';
  if (customerEmailInput instanceof HTMLInputElement) customerEmailInput.value = accountEmail || (typeof customer.email === 'string' ? customer.email : '');
  if (customerPhoneInput instanceof HTMLInputElement) customerPhoneInput.value = typeof customer.phone === 'string' ? customer.phone : '';
  if (customerDateInput instanceof HTMLInputElement) customerDateInput.value = typeof customer.requestedDate === 'string' ? customer.requestedDate : '';
  fulfilment = normaliseFulfilment(customer.fulfilmentMethod);
  if (customerMethodInput instanceof HTMLSelectElement) customerMethodInput.value = fulfilment;
  const storedAddress = splitStoredDeliveryAddress(customer.deliveryAddress);
  deliveryAddressDraft = {
    line1: typeof customer.deliveryAddressLine1 === 'string' ? customer.deliveryAddressLine1 : storedAddress.line1,
    line2: typeof customer.deliveryAddressLine2 === 'string' ? customer.deliveryAddressLine2 : storedAddress.line2,
    postcode: typeof customer.deliveryPostcode === 'string' ? customer.deliveryPostcode : storedAddress.postcode,
  };
  if (customerNotesInput instanceof HTMLTextAreaElement) customerNotesInput.value = typeof customer.notes === 'string' ? customer.notes : '';
  if (customerAllergiesInput instanceof HTMLTextAreaElement) customerAllergiesInput.value = typeof customer.allergies === 'string' ? customer.allergies : '';
  if (marketingOptInInput instanceof HTMLInputElement) marketingOptInInput.checked = customer.marketingOptIn === true;
  renderFulfilmentDetails();
};

const startCheckout = async () => {
  const { items: cartItems, removed } = pruneEnquireOnlyCartItems();
  if (!cartItems.length) {
    showCheckoutStatus(
      removed.length
        ? `${removed.join(', ')} ${removed.length === 1 ? 'is' : 'are'} now enquiry only and ${removed.length === 1 ? 'has' : 'have'} been removed from your cart.`
        : 'Add at least one item to your cart before continuing to checkout.',
      'error'
    );
    renderCart();
    return;
  }

  if (!(checkoutButton instanceof HTMLButtonElement)) return;

  const endpoint = checkoutButton.dataset.checkoutEndpoint || '/api/checkout/session';
  const originalText = checkoutButton.textContent || 'Proceed to checkout';
  const customerError = validateCheckoutCustomer();

  if (customerError) {
    showCheckoutStatus(customerError, 'error');
    return;
  }

  const payload = buildCheckoutPayload(cartItems);
  persistCheckoutCustomer();
  persistCheckoutDraft(payload);
  hideCheckoutStatus();

  checkoutButton.disabled = true;
  checkoutButton.textContent = 'Preparing checkout...';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));

    if (response.ok && result?.checkoutUrl) {
      showCheckoutStatus('Redirecting to secure checkout...', 'success');
      window.location.href = result.checkoutUrl;
      return;
    }

    if (response.status === 501) {
      showCheckoutStatus(result?.message || 'Hosted checkout is not connected yet. Please continue with your enquiry for now.');
      return;
    }

    showCheckoutStatus(result?.message || 'We could not prepare checkout right now. Please try again or continue with your enquiry.', 'error');
  } catch {
    showCheckoutStatus('We could not prepare checkout right now. Please try again or continue with your enquiry.', 'error');
  } finally {
    checkoutButton.disabled = false;
    checkoutButton.textContent = originalText;
  }
};

const applyDiscountCode = async () => {
  const discountCode = discountCodeInput instanceof HTMLInputElement ? discountCodeInput.value.trim().toUpperCase() : '';
  const email = customerEmailInput instanceof HTMLInputElement ? customerEmailInput.value.trim() : '';
  const subtotalPence = getCartSubtotalPence();

  if (!discountCode) {
    showDiscountStatus('Enter a discount code first.', 'error');
    return;
  }

  if (!email) {
    showDiscountStatus('Enter the checkout email linked to your discount code first.', 'error');
    return;
  }

  if (discountApplyButton instanceof HTMLButtonElement) {
    discountApplyButton.disabled = true;
    discountApplyButton.textContent = 'Checking...';
  }

  try {
    const response = await fetch('/api/customers/discount', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ email, discountCode, subtotalPence })
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || result?.success === false) {
      appliedDiscount = null;
      showDiscountStatus(result?.message || 'That discount code could not be applied.', 'error');
      renderCart();
      return;
    }

    appliedDiscount = {
      discountCode: result.discountCode,
      discountPercent: result.discountPercent,
      discountMinimumSubtotalPence: result.discountMinimumSubtotalPence,
      discountAmountPence: result.discountAmountPence,
      discountedTotalPence: result.discountedTotalPence
    };
    showDiscountStatus(`10% signup discount applied. You saved ${formatMoney(result.discountAmountPence)}.`, 'success');
    renderCart();
  } catch {
    appliedDiscount = null;
    showDiscountStatus('That discount code could not be checked right now. Please try again.', 'error');
    renderCart();
  } finally {
    if (discountApplyButton instanceof HTMLButtonElement) {
      discountApplyButton.disabled = false;
      discountApplyButton.textContent = 'Apply';
    }
  }
};

const renderCart = () => {
  const { items: cartItems, removed } = pruneEnquireOnlyCartItems();
  if (!(emptyEl instanceof HTMLElement) || !(contentEl instanceof HTMLElement) || !(itemsEl instanceof HTMLElement) || !(totalEl instanceof HTMLElement)) return;

  itemsEl.innerHTML = '';

  if (!cartItems.length) {
    emptyEl.classList.remove('hidden');
    contentEl.classList.add('hidden');
    if (checkoutButton instanceof HTMLButtonElement) checkoutButton.disabled = true;
    if (removed.length) {
      showCheckoutStatus(`${removed.join(', ')} ${removed.length === 1 ? 'is' : 'are'} now enquiry only and ${removed.length === 1 ? 'has' : 'have'} been removed from your cart.`, 'error');
    } else {
      hideCheckoutStatus();
    }
    return;
  }

  emptyEl.classList.add('hidden');
  contentEl.classList.remove('hidden');
  if (checkoutButton instanceof HTMLButtonElement) checkoutButton.disabled = false;
  if (removed.length) {
    showCheckoutStatus(`${removed.join(', ')} ${removed.length === 1 ? 'is' : 'are'} now enquiry only and ${removed.length === 1 ? 'has' : 'have'} been removed from your cart.`, 'error');
  }

  const totalPence = getCartSubtotalPence(cartItems);
  if (appliedDiscount && totalPence < (appliedDiscount.discountMinimumSubtotalPence || 2000)) {
    appliedDiscount = null;
    showDiscountStatus('This code can only be used on orders over £20.', 'error');
  }
  clampAppliedLoyalty(cartItems);
  updateLoyaltyPanel(cartItems);
  totalEl.textContent = formatMoney(Math.max(0, totalPence - (appliedDiscount?.discountAmountPence || 0) - appliedLoyaltyPence));

  for (const item of cartItems) {
    const quantityValue = normaliseQuantity(item.quantity);
    const lineTotalPence = Number(item.pricePence || 0) * quantityValue;

    const row = document.createElement('article');
    row.className = 'grid gap-4 rounded-[20px] border border-[#f4c8d9] bg-white p-4 shadow-[0_12px_36px_rgba(27,29,39,0.06)] sm:grid-cols-[96px_1fr_auto] sm:items-center';

    const image = document.createElement('img');
    image.src = item.imageUrl || '/favicon.ico';
    image.alt = item.productName || 'Cart item';
    image.className = 'h-24 w-24 rounded-[14px] object-cover';

    const details = document.createElement('div');
    details.className = 'space-y-2';

    const title = document.createElement('h2');
    title.className = 'text-2xl font-semibold text-[var(--brand-ink)]';
    title.textContent = item.productName || 'Product';

    const options = document.createElement('p');
    options.className = 'text-sm text-[var(--brand-ink-soft)]';
    options.textContent = item.flavour
      ? `${item.flavour} · ${item.servingSize || 'Selected option'}`
      : item.servingSize || 'Selected option';

    const quantityWrap = document.createElement('div');
    quantityWrap.className = 'flex w-fit items-center overflow-hidden rounded-full border border-[#f4c8d9] bg-[#fff7fa]';

    const decreaseButton = document.createElement('button');
    decreaseButton.type = 'button';
    decreaseButton.className = 'flex h-9 w-9 items-center justify-center text-lg text-[var(--brand-ink)]';
    decreaseButton.textContent = '−';
    decreaseButton.setAttribute('aria-label', `Decrease quantity for ${item.productName || 'item'}`);
    decreaseButton.disabled = quantityValue <= 1;
    decreaseButton.addEventListener('click', () => updateCartItemQuantity(item.lineId, quantityValue - 1));

    const quantityDisplay = document.createElement('span');
    quantityDisplay.className = 'min-w-10 px-3 text-center text-sm font-semibold text-[var(--brand-ink)]';
    quantityDisplay.textContent = String(quantityValue);

    const increaseButton = document.createElement('button');
    increaseButton.type = 'button';
    increaseButton.className = 'flex h-9 w-9 items-center justify-center text-lg text-[var(--brand-ink)]';
    increaseButton.textContent = '+';
    increaseButton.setAttribute('aria-label', `Increase quantity for ${item.productName || 'item'}`);
    increaseButton.addEventListener('click', () => updateCartItemQuantity(item.lineId, quantityValue + 1));

    quantityWrap.append(decreaseButton, quantityDisplay, increaseButton);
    details.append(title, options, quantityWrap);

    const actions = document.createElement('div');
    actions.className = 'space-y-2 text-left sm:text-right';

    const unitPrice = document.createElement('p');
    unitPrice.className = 'text-sm text-[var(--brand-ink-soft)]';
    unitPrice.textContent = `${item.price} each`;

    const lineTotal = document.createElement('p');
    lineTotal.className = 'text-lg font-semibold text-[var(--brand-ink)]';
    lineTotal.textContent = formatMoney(lineTotalPence);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'text-sm text-[var(--brand-ink-soft)] transition hover:text-[var(--brand-ink)]';
    removeButton.textContent = 'Remove';
    removeButton.setAttribute('aria-label', `Remove ${item.productName || 'item'} from cart`);
    removeButton.addEventListener('click', () => removeCartItem(item.lineId));

    actions.append(unitPrice, lineTotal, removeButton);
    row.append(image, details, actions);
    itemsEl.append(row);
  }
};

clearCartButton?.addEventListener('click', () => {
  writeCart([]);
  renderCart();
});

checkoutButton?.addEventListener('click', startCheckout);
discountApplyButton?.addEventListener('click', applyDiscountCode);
discountCodeInput?.addEventListener('input', () => {
  if (appliedDiscount) clearAppliedDiscount('Discount removed. Apply the code again to use it.');
});
customerEmailInput?.addEventListener('input', () => {
  if (appliedDiscount) clearAppliedDiscount('Discount removed because the checkout email changed.');
});
loyaltyUseMaxButton?.addEventListener('click', () => applyLoyaltyAmount(getMaxLoyaltyPence()));
loyaltyRemoveButton?.addEventListener('click', () => {
  appliedLoyaltyPence = 0;
  hideLoyaltyStatus();
  renderCart();
});
loyaltyAmountInput?.addEventListener('change', () => {
  const value = loyaltyAmountInput instanceof HTMLInputElement ? Number(loyaltyAmountInput.value) : 0;
  applyLoyaltyAmount(Math.round((Number.isFinite(value) ? value : 0) * 100));
});

[
  customerNameInput,
  customerEmailInput,
  customerPhoneInput,
  customerDateInput,
  customerMethodInput,
  customerNotesInput,
  customerAllergiesInput,
  marketingOptInInput
].forEach((field) => field?.addEventListener('input', persistCheckoutCustomer));
marketingOptInInput?.addEventListener('change', persistCheckoutCustomer);

customerMethodInput?.addEventListener('change', () => {
  fulfilment = normaliseFulfilment(customerMethodInput.value);
  renderFulfilmentDetails();
  persistCheckoutCustomer();
});

hydrateCheckoutCustomer();
renderCart();
loadLoyaltyBalance();
