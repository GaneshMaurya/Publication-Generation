class PublicationManager {
    constructor() {
        this.allPublications = [];
        this.filteredPublications = [];
        this.itemsPerPage = 10;
        this.currentPage = 1;
        this.currentYear = new Date().getFullYear();
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('fetchPublications').addEventListener('click', () => this.fetchPublications());
        document.getElementById('authorName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.fetchPublications();
        });

        ['groupBy', 'sortBy', 'sortOrder'].forEach(id => {
            document.getElementById(id).addEventListener('change', () => this.updateDisplay());
        });
    }

    async fetchPublications() {
        const authorName = document.getElementById('authorName').value.trim();
        if (!authorName) {
            this.showError('Please enter a researcher name');
            return;
        }

        this.showLoading(true);
        this.showError('');

        try {
            const url = `https://dblp.org/search/publ/api?q=${encodeURIComponent(authorName)}&format=json&h=1000`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const data = await response.json();

            if (!data.result.hits.hit || data.result.hits.hit.length === 0) {
                this.showError('No publications found for this researcher');
                this.allPublications = [];
                this.filteredPublications = [];
            } else {
                this.allPublications = this.parsePublications(data);
                this.filteredPublications = [...this.allPublications];
            }

            this.currentPage = 1;
            this.updateDisplay();
        } catch (error) {
            console.error('Error fetching publications:', error);
            // this.showError('Error fetching publications. Please try again later.');
        } finally {
            this.showLoading(false);
        }
    }

    parsePublications(data) {
        return data.result.hits.hit
            .map(hit => ({
                title: hit.info.title,
                authors: Array.isArray(hit.info.authors?.author)
                    ? hit.info.authors.author.map(a => a.text)
                    : hit.info.authors?.author?.text ? [hit.info.authors.author.text] : [],
                year: parseInt(hit.info.year) || null,
                type: hit.info.type || 'unknown',
                venue: hit.info.venue || '',
                doi: hit.info.doi || ''
            }))
            .filter(pub => pub.year && pub.year <= this.currentYear);
    }

    sortPublications() {
        const sortBy = document.getElementById('sortBy').value;
        const sortOrder = document.getElementById('sortOrder').value;
        const multiplier = sortOrder === 'asc' ? 1 : -1;

        this.filteredPublications.sort((a, b) => {
            if (!a.isGroupHeader && !b.isGroupHeader) {
                if (sortBy === 'year') {
                    return multiplier * ((a.year || 0) - (b.year || 0));
                }
                if (sortBy === 'title') {
                    return multiplier * (a.title || '').localeCompare(b.title || '');
                }
            }
            return 0;
        });
    }

    groupPublications() {
        const groupBy = document.getElementById('groupBy').value;
        const groups = new Map();

        this.filteredPublications.forEach(pub => {
            let key = this.getGroupKey(pub, groupBy);
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(pub);
        });

        this.filteredPublications = Array.from(groups.entries())
            .sort(([keyA], [keyB]) => keyB.localeCompare(keyA))
            .flatMap(([key, pubs]) => [
                { isGroupHeader: true, value: key },
                ...pubs
            ]);
    }

    getGroupKey(pub, groupBy) {
        switch (groupBy) {
            case 'year': return pub.year?.toString() || 'Unknown Year';
            case 'type': return this.formatPublicationType(pub.type);
            case 'author': return pub.authors[0] || 'Unknown Author';
            default: return 'All Publications';
        }
    }

    formatPublicationType(type) {
        const types = {
            'article': 'Journal Articles',
            'inproceedings': 'Conference Papers',
            'book': 'Books',
            'incollection': 'Book Chapters',
            'phdthesis': 'PhD Theses',
            'mastersthesis': 'Master\'s Theses'
        };
        return types[type] || 'Other Publications';
    }

    updateDisplay() {
        this.filteredPublications = [...this.allPublications];
        this.sortPublications();
        this.groupPublications();
        this.displayPublications();
        this.setupPagination();
    }

    displayPublications() {
        const list = document.getElementById('publicationList');
        list.innerHTML = '';

        if (this.filteredPublications.length === 0) {
            list.innerHTML = '<div class="error-message">No publications match the current filters</div>';
            return;
        }

        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const pagePublications = this.filteredPublications.slice(startIndex, endIndex);

        pagePublications.forEach(pub => {
            if (pub.isGroupHeader) {
                list.appendChild(this.createGroupHeader(pub.value));
            } else {
                list.appendChild(this.createPublicationItem(pub));
            }
        });
    }

    createGroupHeader(value) {
        const header = document.createElement('div');
        header.className = 'group-header';
        header.textContent = value;
        return header;
    }

    createPublicationItem(pub) {
        const item = document.createElement('div');
        const highlightedTitle = this.highlightSearch(pub.title)
        const highlightedAuthors = this.highlightSearch(pub.authors.join(', '))

        item.className = 'publication-item';
        

        item.innerHTML = `
            <h3>${highlightedTitle}</h3>
            <p><strong>Authors:</strong> ${highlightedAuthors}</p>
            <p><strong>Year:</strong> ${pub.year || 'N/A'}</p>
            <p><strong>Type:</strong> ${this.formatPublicationType(pub.type)}</p>
            ${pub.venue ? `<p><strong>Venue:</strong> ${pub.venue}</p>` : ''}
            ${pub.doi ? `<p><strong>DOI:</strong> <a href="https://doi.org/${pub.doi}" target="_blank">${pub.doi}</a></p>` : ''}
        `;
        return item;
    }
    
    highlightSearch(content) {
        const queryString = document.getElementById('authorName').value.trim();
        const queryWords = queryString.split(/\s+/);
        console.info(queryWords)
        const regex = new RegExp(`(${queryWords.join('|')})`, 'gi');
        const highlightedText = content.replace(regex, '<span class="highlight">$1</span>');
        return highlightedText
    }

    setupPagination() {
        const pagination = document.getElementById('pagination');
        pagination.innerHTML = '';

        const totalPages = Math.ceil(this.filteredPublications.length / this.itemsPerPage);
        
        if (totalPages <= 1) return;

        this.addPaginationButton(pagination, '«', this.currentPage > 1, () => {
            this.currentPage = 1;
            this.updateDisplay();
        });

        this.addPaginationButton(pagination, '‹', this.currentPage > 1, () => {
            this.currentPage--;
            this.updateDisplay();
        });

        for (let i = 1; i <= totalPages; i++) {
            if (this.shouldShowPageNumber(i, totalPages)) {
                this.addPaginationButton(pagination, i.toString(), true, () => {
                    this.currentPage = i;
                    this.updateDisplay();
                }, i === this.currentPage);
            } else if (this.shouldShowEllipsis(i, totalPages)) {
                const span = document.createElement('span');
                span.textContent = '...';
                pagination.appendChild(span);
            }
        }

        this.addPaginationButton(pagination, '›', this.currentPage < totalPages, () => {
            this.currentPage++;
            this.updateDisplay();
        });

        this.addPaginationButton(pagination, '»', this.currentPage < totalPages, () => {
            this.currentPage = totalPages;
            this.updateDisplay();
        });
    }

    shouldShowPageNumber(page, totalPages) {
        return page === 1 || page === totalPages || 
               (page >= this.currentPage - 1 && page <= this.currentPage + 1);
    }

    shouldShowEllipsis(page, totalPages) {
        return (page === 2 && this.currentPage > 4) || 
               (page === totalPages - 1 && this.currentPage < totalPages - 3);
    }

    addPaginationButton(container, text, enabled, onClick, isActive = false) {
        const button = document.createElement('button');
        button.textContent = text;
        button.disabled = !enabled;
        if (isActive) button.classList.add('active');
        if (enabled) {
            button.addEventListener('click', onClick);
        }
        container.appendChild(button);
    }

    showLoading(show) {
        const loader = document.getElementById('loadingIndicator');
        loader.style.display = show ? 'block' : 'none';
        document.getElementById('publicationList').style.display = show ? 'none' : 'block';
    }

    showError(message) {
        const errorDiv = document.getElementById('errorMessage');
        errorDiv.textContent = message;
        errorDiv.style.display = message ? 'block' : 'none';
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

const manager = new PublicationManager();

//const yearInput = document.getElementById('filterYear');
const debouncedUpdate = manager.debounce(() => manager.updateDisplay(), 300);
//yearInput.addEventListener('input', debouncedUpdate);