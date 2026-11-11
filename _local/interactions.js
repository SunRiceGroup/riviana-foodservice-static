(() => {
    'use strict';

    const searchControls = document.querySelectorAll('[data-static-search]');
    const parameters = new URLSearchParams(location.search);
    const query = parameters.get('s')?.trim() || '';
    const recipeArchive = document.querySelector('[data-recipe-archive]');
    if (recipeArchive) {
        location.replace(recipeArchive.href + location.hash);
        return;
    }
    if ((location.pathname === '/' || location.pathname === '/index.html') && query) {
        location.replace('/search/?s=' + encodeURIComponent(query));
        return;
    }

    for (const control of searchControls) {
        const input = control.querySelector('input[type="search"]');
        const button = control.querySelector('button');
        const search = () => {
            const value = input.value.trim();
            if (value) location.assign('/search/?s=' + encodeURIComponent(value));
        };
        button.addEventListener('click', search);
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.isComposing) search();
        });
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function background(node, path) {
        if (path) node.style.backgroundImage = 'url(' + JSON.stringify(encodeURI(path)) + ')';
        return node;
    }

    async function data(path) {
        const response = await fetch('/_local/' + path);
        if (!response.ok) throw new Error('Static data unavailable: ' + path);
        return response.json();
    }

    function renderSearchCard(item) {
        const column = element('div', 'col-sm-4');
        const card = element('div', 'search-result');
        const image = background(element('div', 'search-thumb'), item.image);
        const link = element('a');
        link.href = item.url;
        link.title = item.title;
        link.append(element('h3', '', item.title));
        card.append(image, link, element('p', '', item.description));
        column.append(card);
        return column;
    }

    function searchable(value) {
        return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('en-AU');
    }

    async function showSearch() {
        const results = document.getElementById('static-search-results');
        if (!results) return;
        const heading = document.getElementById('static-search-heading');
        if (!query) {
            results.append(element('p', 'col-sm-12', 'Enter a search term.'));
            return;
        }
        heading.textContent = 'Search results for: ' + query;
        for (const control of searchControls) control.querySelector('input').value = query;

        const phrase = searchable(query);
        const tokens = phrase.match(/[\p{Letter}\p{Number}]+/gu) || [phrase];
        try {
            const entries = await data('search.json');
            const matches = [];
            for (const entry of entries) {
                const title = searchable(entry.title);
                const fullText = searchable(entry.title + ' ' + entry.description + ' ' + entry.text);
                if (tokens.every((token) => fullText.includes(token))) {
                    const score = title === phrase ? 3 : title.includes(phrase) ? 2 : tokens.every((token) => title.includes(token)) ? 1 : 0;
                    matches.push({entry, score});
                }
            }
            matches.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, 'en-AU'));
            if (matches.length) {
                results.append(...matches.map(({entry}) => renderSearchCard(entry)));
            } else {
                results.append(element('p', 'col-sm-12', 'No results were found.'));
            }
        } catch {
            results.append(element('p', 'col-sm-12', 'Search is temporarily unavailable.'));
        }
    }

    function filterCard(item, isRecipe) {
        const card = element('div', isRecipe ? 'col-sm-6 text-center pad40 recipe' : 'col-xs-12 col-sm-6 col-md-4 text-center product');
        const thumbnail = element('a', isRecipe ? '' : 'product-thumb');
        thumbnail.href = item.url;
        thumbnail.title = item.title;
        if (isRecipe) {
            thumbnail.append(background(element('div', 'container-fluid recipe-hero recipe-thumb'), item.image));
        } else {
            background(thumbnail, item.image);
        }
        const title = element('h3', '', item.title);
        const link = element('a');
        link.href = item.url;
        link.title = item.title;
        const label = element('h5', 'view-product', isRecipe ? 'View recipe ' : 'View product ');
        const icon = element('img');
        icon.src = '/wp-content/themes/rivianafoodservice/images/chevron-right.svg';
        icon.height = 12;
        icon.alt = '';
        label.append(icon);
        link.append(label);
        card.append(thumbnail, title, link);
        return card;
    }

    function pagesNavigation(page, pageCount) {
        if (pageCount < 2) return null;
        const navigation = element('nav', 'woocommerce-pagination');
        navigation.setAttribute('aria-label', 'Results pages');
        const list = element('ul', 'page-numbers');
        const add = (target, label, className = '') => {
            const current = target === page;
            const control = element(current ? 'span' : 'a', 'page-numbers ' + (current ? 'current' : className), label);
            if (current) {
                control.setAttribute('aria-current', 'page');
            } else {
                control.href = '#response';
                control.dataset.page = target;
            }
            const item = element('li');
            item.append(control);
            list.append(item);
        };
        if (page > 1) add(page - 1, '←', 'prev');
        for (let number = 1; number <= pageCount; number += 1) add(number, String(number));
        if (page < pageCount) add(page + 1, '→', 'next');
        navigation.append(list);
        return navigation;
    }

    function equaliseCards(response, selector) {
        const cards = Array.from(response.querySelectorAll(selector));
        for (const card of cards) card.style.height = '';
        const tallest = Math.max(0, ...cards.map((card) => card.offsetHeight));
        for (const card of cards) card.style.height = tallest + 'px';
    }

    function setupFilters() {
        const controls = document.querySelector('[data-static-filter]');
        if (!controls) return;
        const response = document.getElementById('response');
        const status = element('p', 'sr-only');
        status.setAttribute('role', 'status');
        response.before(status);

        const slug = controls.dataset.staticFilter;
        const isRecipe = slug === 'recipes';
        const selector = isRecipe ? '.recipe' : '.product';
        const initialPageSize = response.querySelectorAll(selector).length;
        const pageSize = isRecipe ? 10 : 9;
        const recipeCategory = isRecipe ? controls.querySelector('select') : null;
        const initialCategory = parameters.get('category');
        if (initialCategory && recipeCategory && Array.from(recipeCategory.options).some((option) => option.value === initialCategory)) {
            recipeCategory.value = initialCategory;
        }
        let catalogue;
        let newestRender = 0;
        let page = 1;

        const resize = () => equaliseCards(response, selector);
        const filtered = () => {
            if (isRecipe) {
                return {items: catalogue[recipeCategory.value] || [], firstSize: pageSize};
            }
            const terms = Array.from(controls.querySelectorAll('input:checked'), (input) => Number(input.value));
            if (!terms.length) return {items: catalogue, firstSize: initialPageSize || pageSize};
            return {items: catalogue.filter((item) => item.terms.some((term) => terms.includes(term))), firstSize: pageSize};
        };
        const updateNavigation = (pageCount) => {
            const previous = response.querySelector('nav.woocommerce-pagination');
            const navigation = pagesNavigation(page, pageCount);
            if (previous) previous.remove();
            if (navigation) response.append(navigation);
        };
        const render = async (requestedPage, preserveCards = false) => {
            const thisRender = ++newestRender;
            try {
                catalogue ||= await data('filter-' + slug + '.json');
                if (thisRender !== newestRender) return;
                const {items, firstSize} = filtered();
                const pageCount = 1 + Math.ceil(Math.max(0, items.length - firstSize) / pageSize);
                page = Math.max(1, Math.min(pageCount, requestedPage));
                if (!preserveCards) {
                    const start = page === 1 ? 0 : firstSize + (page - 2) * pageSize;
                    const size = page === 1 ? firstSize : pageSize;
                    const cards = items.slice(start, start + size).map((item) => filterCard(item, isRecipe));
                    const list = isRecipe ? response : element('ul', 'products columns-4');
                    response.replaceChildren();
                    if (!isRecipe) response.append(list);
                    if (cards.length) list.append(...cards);
                    else response.append(element('p', 'col-sm-12', isRecipe ? 'No recipes were found.' : 'No products were found.'));
                    status.textContent = items.length + ' ' + (isRecipe ? 'recipes' : 'products') + ', page ' + page + ' of ' + pageCount;
                }
                updateNavigation(pageCount);
                resize();
            } catch {
                status.textContent = 'The filter is temporarily unavailable.';
            }
        };

        controls.addEventListener('change', () => {
            if (recipeCategory) {
                const address = new URL(location.href);
                if (recipeCategory.value === 'all') address.searchParams.delete('category');
                else address.searchParams.set('category', recipeCategory.value);
                history.replaceState(null, '', address);
            }
            render(1);
        });
        response.addEventListener('click', (event) => {
            const link = event.target.closest('a[data-page]');
            if (!link) return;
            event.preventDefault();
            render(Number(link.dataset.page));
        });
        window.addEventListener('resize', resize);
        render(1, !recipeCategory || recipeCategory.value === 'all');
    }

    for (const share of document.querySelectorAll('[data-static-share]')) {
        let hideTimer;
        share.addEventListener('click', async (event) => {
            event.preventDefault();
            try {
                await navigator.clipboard.writeText(location.href);
                const trigger = window.jQuery(share);
                trigger.popover({viewport: 'body', placement: 'left', trigger: 'manual', content: 'Recipe link copied.'});
                trigger.popover('show');
                clearTimeout(hideTimer);
                hideTimer = setTimeout(() => trigger.popover('hide'), 2400);
            } catch {
                window.prompt('Copy this recipe link', location.href);
            }
        });
    }

    showSearch();
    setupFilters();
})();
