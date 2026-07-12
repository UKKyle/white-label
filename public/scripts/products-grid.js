const grid = document.getElementById('products-grid');
const cards = Array.from(document.querySelectorAll('[data-product-card]'));
const categoryFilter = document.getElementById('products-category-filter');
const priceSort = document.getElementById('products-price-sort');
const emptyState = document.getElementById('products-empty-state');

const applyProductFilters = () => {
  if (!(grid instanceof HTMLElement)) return;

  const selectedCategory = categoryFilter instanceof HTMLSelectElement ? categoryFilter.value : 'all';
  const selectedSort = priceSort instanceof HTMLSelectElement ? priceSort.value : 'default';

  const filteredCards = cards.filter((card) => {
    if (!(card instanceof HTMLElement)) return false;
    if (selectedCategory === 'all') return true;
    return card.dataset.category === selectedCategory;
  });

  const sortedCards = [...filteredCards].sort((a, b) => {
    const aPrice = Number(a instanceof HTMLElement ? a.dataset.price || 0 : 0);
    const bPrice = Number(b instanceof HTMLElement ? b.dataset.price || 0 : 0);

    if (selectedSort === 'price-asc') return aPrice - bPrice;
    if (selectedSort === 'price-desc') return bPrice - aPrice;
    return cards.indexOf(a) - cards.indexOf(b);
  });

  for (const card of cards) {
    if (card instanceof HTMLElement) {
      card.classList.add('hidden');
    }
  }

  for (const card of sortedCards) {
    if (card instanceof HTMLElement) {
      card.classList.remove('hidden');
      grid.append(card);
    }
  }

  if (emptyState instanceof HTMLElement) {
    emptyState.classList.toggle('hidden', sortedCards.length > 0);
  }
};

categoryFilter?.addEventListener('change', applyProductFilters);
priceSort?.addEventListener('change', applyProductFilters);
applyProductFilters();
