const DATE_FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateString(value) {
  const match = String(value || '').match(DATE_FORMAT);
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, monthIndex, day));

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatDateString(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function addMonths(date, delta) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
}

function getDaysInMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

function getWeekdayOffset(date) {
  const weekday = date.getUTCDay();
  return weekday === 0 ? 6 : weekday - 1;
}

function formatLongDate(dateString) {
  const date = parseDateString(dateString);
  if (!date) return '';

  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function buildCalendarDays(monthDate) {
  const days = [];
  const offset = getWeekdayOffset(monthDate);
  const daysInMonth = getDaysInMonth(monthDate);

  for (let index = 0; index < offset; index += 1) {
    days.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), day)));
  }

  return days;
}

function readUnavailableDates(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => parseDateString(item)) : []);
  } catch {
    return new Set();
  }
}

function dispatchFieldChange(field) {
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

function initDatePicker(root) {
  const input = root.querySelector('[data-date-picker-input]');
  const control = root.querySelector('[data-date-picker-control]');
  const trigger = root.querySelector('[data-date-picker-trigger]');
  const popover = root.querySelector('[data-date-picker-popover]');
  const selectedText = root.querySelector('[data-date-picker-selected]');
  const clearButton = root.querySelector('[data-date-picker-clear]');
  const monthLabel = root.querySelector('[data-date-picker-month]');
  const grid = root.querySelector('[data-date-picker-grid]');
  const prevButton = root.querySelector('[data-date-picker-prev]');
  const nextButton = root.querySelector('[data-date-picker-next]');

  if (!(input instanceof HTMLInputElement) || !(grid instanceof HTMLElement) || !(monthLabel instanceof HTMLElement)) {
    return;
  }

  const unavailableDates = readUnavailableDates(root.dataset.unavailableDates);
  const disablePast = root.dataset.disablePast !== 'false';
  const today = todayUtc();
  let selectedDate = parseDateString(input.value) ? input.value : '';
  let viewDate = selectedDate ? startOfMonth(parseDateString(selectedDate)) : startOfMonth(today);
  let isOpen = false;

  const resetMobilePosition = () => {
    if (!(popover instanceof HTMLElement)) return;
    popover.style.removeProperty('top');
    popover.style.removeProperty('right');
    popover.style.removeProperty('bottom');
    popover.style.removeProperty('left');
    popover.style.removeProperty('width');
  };

  const positionMobilePopover = () => {
    if (!(control instanceof HTMLElement) || !(popover instanceof HTMLElement)) return;

    const isMobile = window.matchMedia('(max-width: 640px)').matches;
    if (!isMobile) {
      resetMobilePosition();
      return;
    }

    const gap = 8;
    const margin = 12;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1;
    const rect = control.getBoundingClientRect();
    const width = Math.min(viewportWidth - margin * 2, Math.max(rect.width, 280));

    popover.style.width = `${width}px`;
    popover.style.left = `${Math.min(Math.max(rect.left, margin), viewportWidth - width - margin)}px`;
    popover.style.right = 'auto';
    popover.style.bottom = 'auto';

    const popoverHeight = Math.min(popover.offsetHeight || 340, viewportHeight - margin * 2);
    const spaceBelow = viewportHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const top = spaceBelow >= popoverHeight || spaceBelow >= spaceAbove
      ? Math.min(rect.bottom + gap, viewportHeight - popoverHeight - margin)
      : Math.max(margin, rect.top - popoverHeight - gap);

    popover.style.top = `${Math.max(margin, top)}px`;
  };

  const setOpen = (open) => {
    isOpen = open;
    root.classList.toggle('date-picker--open', open);
    input.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      window.requestAnimationFrame(positionMobilePopover);
    } else {
      resetMobilePosition();
    }
  };

  const openPicker = () => setOpen(true);
  const closePicker = () => setOpen(false);
  const togglePicker = () => setOpen(!isOpen);

  const setSelectedDate = (value, options = {}) => {
    selectedDate = value;
    input.value = value;

    if (selectedText instanceof HTMLElement) {
      selectedText.textContent = value ? `Selected: ${formatLongDate(value)}` : 'Choose a date from the calendar.';
    }

    if (clearButton instanceof HTMLButtonElement) {
      clearButton.classList.toggle('hidden', !value);
    }

    dispatchFieldChange(input);
    render();

    if (options.close) {
      closePicker();
      input.focus();
    }
  };

  const isDisabled = (dateString) => {
    if (unavailableDates.has(dateString)) return true;
    if (!disablePast) return false;
    const date = parseDateString(dateString);
    return date ? date.getTime() < today.getTime() : false;
  };

  const render = () => {
    monthLabel.textContent = new Intl.DateTimeFormat('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(viewDate);

    grid.innerHTML = '';

    for (const day of buildCalendarDays(viewDate)) {
      if (!day) {
        const spacer = document.createElement('span');
        spacer.className = 'date-picker__day date-picker__day--spacer';
        spacer.setAttribute('aria-hidden', 'true');
        grid.append(spacer);
        continue;
      }

      const dateString = formatDateString(day);
      const button = document.createElement('button');
      const disabled = isDisabled(dateString);
      const selected = selectedDate === dateString;
      button.type = 'button';
      button.className = 'date-picker__day';
      if (disabled) button.classList.add('date-picker__day--disabled');
      if (selected) button.classList.add('date-picker__day--selected');
      if (dateString === formatDateString(today)) button.classList.add('date-picker__day--today');
      button.textContent = String(day.getUTCDate());
      button.disabled = disabled;
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      button.setAttribute('aria-label', formatLongDate(dateString) || dateString);
      button.addEventListener('click', () => setSelectedDate(dateString, { close: true }));
      grid.append(button);
    }
  };

  input.addEventListener('click', openPicker);
  input.addEventListener('focus', openPicker);
  control?.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    openPicker();
    input.focus({ preventScroll: true });
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closePicker();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      togglePicker();
    }
  });

  trigger?.addEventListener('click', () => {
    openPicker();
    input.focus();
  });

  document.addEventListener('click', (event) => {
    if (!isOpen || root.contains(event.target)) return;
    closePicker();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closePicker();
    }
  });

  window.addEventListener('resize', () => {
    if (isOpen) positionMobilePopover();
  });

  window.addEventListener('scroll', () => {
    if (isOpen) positionMobilePopover();
  }, { passive: true });

  prevButton?.addEventListener('click', () => {
    viewDate = addMonths(viewDate, -1);
    render();
  });

  nextButton?.addEventListener('click', () => {
    viewDate = addMonths(viewDate, 1);
    render();
  });

  clearButton?.addEventListener('click', () => {
    setSelectedDate('');
    input.focus();
  });

  input.form?.addEventListener('reset', () => {
    window.setTimeout(() => {
      selectedDate = parseDateString(input.value) ? input.value : '';
      viewDate = selectedDate ? startOfMonth(parseDateString(selectedDate)) : startOfMonth(today);
      if (selectedDate && isDisabled(selectedDate)) {
        selectedDate = '';
        input.value = '';
      }
      setSelectedDate(selectedDate);
    }, 0);
  });

  if (selectedDate && isDisabled(selectedDate)) {
    selectedDate = '';
    input.value = '';
  }

  setSelectedDate(selectedDate);
  closePicker();
}

function initAvailabilityCalendar(root) {
  const input = root.querySelector('[data-availability-input]');
  const monthLabel = root.querySelector('[data-availability-month]');
  const grid = root.querySelector('[data-availability-grid]');
  const prevButton = root.querySelector('[data-availability-prev]');
  const nextButton = root.querySelector('[data-availability-next]');
  const count = root.querySelector('[data-availability-count]');

  if (!(input instanceof HTMLInputElement) || !(monthLabel instanceof HTMLElement) || !(grid instanceof HTMLElement)) {
    return;
  }

  const today = todayUtc();
  let unavailableDates = readUnavailableDates(root.dataset.unavailableDates);
  let viewDate = startOfMonth(today);

  const syncInput = () => {
    const dates = [...unavailableDates].sort();
    input.value = JSON.stringify(dates);
    if (count instanceof HTMLElement) {
      count.textContent = dates.length === 1 ? '1 unavailable date' : `${dates.length} unavailable dates`;
    }
  };

  const toggleDate = (dateString) => {
    if (unavailableDates.has(dateString)) {
      unavailableDates.delete(dateString);
    } else {
      unavailableDates.add(dateString);
    }

    syncInput();
    render();
  };

  const render = () => {
    monthLabel.textContent = new Intl.DateTimeFormat('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(viewDate);

    grid.innerHTML = '';

    for (const day of buildCalendarDays(viewDate)) {
      if (!day) {
        const spacer = document.createElement('span');
        spacer.className = 'availability-calendar__day availability-calendar__day--spacer';
        spacer.setAttribute('aria-hidden', 'true');
        grid.append(spacer);
        continue;
      }

      const dateString = formatDateString(day);
      const button = document.createElement('button');
      const unavailable = unavailableDates.has(dateString);
      const isToday = dateString === formatDateString(today);
      const isPast = day.getTime() < today.getTime();
      button.type = 'button';
      button.className = 'availability-calendar__day';
      if (unavailable) button.classList.add('availability-calendar__day--unavailable');
      if (isToday) button.classList.add('availability-calendar__day--today');
      if (isPast) button.classList.add('availability-calendar__day--past');
      button.textContent = String(day.getUTCDate());
      button.setAttribute('aria-pressed', unavailable ? 'true' : 'false');
      button.setAttribute('aria-label', `${formatLongDate(dateString)}${unavailable ? ' unavailable' : ' available'}`);
      button.addEventListener('click', () => toggleDate(dateString));
      grid.append(button);
    }
  };

  prevButton?.addEventListener('click', () => {
    viewDate = addMonths(viewDate, -1);
    render();
  });

  nextButton?.addEventListener('click', () => {
    viewDate = addMonths(viewDate, 1);
    render();
  });

  syncInput();
  render();

  input.form?.addEventListener('reset', () => {
    window.setTimeout(() => {
      unavailableDates = readUnavailableDates(root.dataset.unavailableDates);
      viewDate = startOfMonth(today);
      syncInput();
      render();
    }, 0);
  });
}

document.querySelectorAll('[data-date-picker]').forEach((root) => {
  if (root instanceof HTMLElement) {
    initDatePicker(root);
  }
});

document.querySelectorAll('[data-availability-calendar]').forEach((root) => {
  if (root instanceof HTMLElement) {
    initAvailabilityCalendar(root);
  }
});
