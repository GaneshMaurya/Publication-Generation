class PublicationManager {
    constructor() {
        this.allPublications = [];
        this.filteredPublications = [];
        this.itemsPerPage = 10;
        this.currentPage = 1;
        this.currentYear = new Date().getFullYear();
        this.myChartInstance = null;
        this.setupEventListeners();
        this.setupItemsPerPageListener();
    }

    setupEventListeners() {
        document.getElementById('fetchPublications').addEventListener('click', () => this.fetchPublications());
        document.getElementById('authorName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.fetchPublications();
        });

        ['groupBy', 'filterYear', 'sortBy', 'sortOrder', 'itemsPerPage'].forEach(id => {
            document.getElementById(id).addEventListener('change', () => this.updateDisplay());
        });
        document.getElementById('exportButton').addEventListener('click', () => {
            const exportType = document.getElementById('exportDropdown').value;

            if (exportType === 'pdf') {
                this.exportToPDF();
            } else if (exportType === 'bib') {
                this.exportToBib();
            } else {
                alert('Please select a valid export option.');
            }
        });
    }

    setupItemsPerPageListener() {
        const itemsPerPageSelect = document.getElementById('itemsPerPage');
        itemsPerPageSelect.addEventListener('change', () => {
            this.itemsPerPage = parseInt(itemsPerPageSelect.value);
            this.currentPage = 1; // Reset to first page
            this.updateDisplay();
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
                // this.showError('No publications found for this researcher');
                this.showError(`No publications found for the exact author name "${document.getElementById('authorName').value.trim()}". 
            Try checking the exact name spelling.`);
                this.allPublications = [];
                this.filteredPublications = [];

                if (this.myChartInstance) {
                    this.myChartInstance.destroy();
                    this.myChartInstance = null;
                }
            } else {
                this.allPublications = this.parsePublications(data);
                this.allPublications = await this.fetchInstitutionInfo(this.allPublications);
                this.filteredPublications = [...this.allPublications];
            }

            this.currentPage = 1;
            this.updateDisplay();
        } catch (error) {
            console.error('Error fetching publications:', error);
        } finally {
            this.showLoading(false);
        }
    }

    parsePublications(data) {
        const authorName = document.getElementById('authorName').value.trim().toLowerCase();

        const matchedPublications = data.result.hits.hit
            .map(hit => ({
                title: hit.info.title,
                authors: Array.isArray(hit.info.authors?.author)
                    ? hit.info.authors.author.map(a => a.text)
                    : hit.info.authors?.author?.text ? [hit.info.authors.author.text] : [],
                year: parseInt(hit.info.year) || null,
                type: hit.info.type || 'unknown',
                venue: hit.info.venue || '',
                doi: hit.info.doi || '',
                institution: null
            }))
            .filter(pub => {
                return pub.year &&
                    pub.year <= this.currentYear &&
                    pub.authors.some(author =>
                        author.toLowerCase().trim() === authorName
                    );
            });

        if (matchedPublications.length === 0) {
            this.showError(`No publications found for the exact author name "${document.getElementById('authorName').value.trim()}". 
            Try checking the exact name spelling.`);
            this.destroyChart();
        }
        else {
            this.createPublicationsPerYearChart(matchedPublications);
        }

        return matchedPublications;
    }

    calculatePublicationsPerYear(matchedPublications) {
        const yearCountMap = new Map();
        matchedPublications.forEach(pub => {
            if (pub.year) {
                yearCountMap.set(pub.year, (yearCountMap.get(pub.year) || 0) + 1);
            }
        });

        const sortedYears = Array.from(yearCountMap.keys()).sort((a, b) => a - b);
        return {
            years: sortedYears,
            counts: sortedYears.map(year => yearCountMap.get(year))
        };
    }

    destroyChart() {
        if (this.myChartInstance) {
            this.myChartInstance.destroy();
        }
    }

    createPublicationsPerYearChart(matchedPublications) {
        const publicationsData = this.calculatePublicationsPerYear(matchedPublications);

        if (this.myChartInstance) {
            this.myChartInstance.destroy();
        }

        const ctx = document.getElementById('publicationsChart').getContext('2d');
        this.myChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: publicationsData.years,
                datasets: [{
                    label: 'Publications per Year',
                    data: publicationsData.counts,
                    backgroundColor: 'rgba(54, 162, 235, 0.5)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        },
                        title: {
                            display: true,
                            text: 'Number of Publications'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Year'
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Publications Distribution by Year',
                        font: {
                            size: 16
                        }
                    },
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    applyFilters() {
        const filterYear = document.getElementById('filterYear').value;

        this.filteredPublications = this.allPublications.filter(pub => {
            const yearMatch = !filterYear || pub.year === parseInt(filterYear);
            return yearMatch;
        });
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
            'Journal Articles': 'Journal Articles',
            'Conference and Workshop Papers': 'Conference and Workshop Papers',
            'Informal and Other Publications': 'Informal and Other Publications'
        };
        return types[type] || 'Other Publications';
    }

    async fetchInstitutionInfo(publications) {
        const authorNameInput = document.getElementById('authorName').value.trim().toLowerCase();

        // Find the latest publication based on the year
        const latestPublication = publications
            .filter(pub => pub.doi && pub.year) // Only consider publications with a DOI and year
            .sort((a, b) => b.year - a.year)[0]; // Sort by year in descending order and take the latest

        if (!latestPublication) {
            publications.forEach(pub => (pub.institution = 'No Institution Data Available'));
            return publications;
        }

        const doi = latestPublication.doi;

        try {
            const openAlexUrl = `https://api.openalex.org/works/doi:${doi}`;
            const response = await fetch(openAlexUrl);
            const openAlexData = await response.json();

            let institutionName = 'No Institution Data Available';

            if (openAlexData.authorships) {
                // Match the input author name and extract the institution name
                const matchingAuthorship = openAlexData.authorships.find(authorship =>
                    authorship.author?.display_name?.toLowerCase() === authorNameInput
                );

                institutionName = matchingAuthorship?.institutions[0]?.display_name || institutionName;
            }

            // Assign the institution name to all publications
            publications.forEach(pub => {
                pub.institution = institutionName;
            });
        } catch (error) {
            console.error(`Error fetching data for DOI ${doi}:`, error);
            // Assign fallback message if API call fails
            publications.forEach(pub => {
                pub.institution = 'No Institution Data Available';
            });
        }
        return publications;
    }

    updateDisplay() {
        this.filteredPublications = [...this.allPublications];
        const yearFilter = document.getElementById('filterYear').value;
        if (yearFilter) {
            this.filteredPublications = this.filteredPublications.filter(
                pub => pub.year === parseInt(yearFilter)
            );
        }
        this.applyFilters();
        this.sortPublications();
        this.groupPublications();
        this.displayPublications();
        this.setupPagination();
    }

    async displayPublications() {
        const list = document.getElementById('publicationList');
        list.innerHTML = '';

        if (this.filteredPublications.length === 0) {
            list.innerHTML = '<div class="error-message">No publications match the current filters</div>';
            return;
        }

        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const pagePublications = this.filteredPublications.slice(startIndex, endIndex);

        const publicationItems = await Promise.all(
            pagePublications.map(async (pub) => {
                if (pub.isGroupHeader) {
                    return this.createGroupHeader(pub.value);
                } else {
                    return this.createPublicationItem(pub);
                }
            })
        );

        publicationItems.forEach(item => list.appendChild(item));
    }

    createGroupHeader(value) {
        const header = document.createElement('div');
        header.className = 'group-header';
        header.textContent = value;
        return header;
    }

    async getAuthorProfileURL(authorName) {
        try {
            this.debug('Fetching profile URL for author:', authorName);

            if (this.authorUrlCache?.has(authorName)) {
                this.debug('Cache hit for author:', authorName);
                return this.authorUrlCache.get(authorName);
            }

            const url = `https://dblp.org/search/author/api?q=${encodeURIComponent(authorName)}&format=json&h=10`;
            this.debug('API Request URL:', url);

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            this.debug('API Response:', data);

            let profileUrl;
            if (data.result.hits.hit && data.result.hits.hit.length > 0) {
                const exactMatch = data.result.hits.hit.find(hit => {
                    const hitAuthorName = hit.info.author;

                    return (
                        hitAuthorName === authorName ||
                        hitAuthorName.toLowerCase() === authorName.toLowerCase() ||
                        this.normalizeAuthorName(hitAuthorName) === this.normalizeAuthorName(authorName)
                    );
                });

                if (exactMatch) {
                    this.debug('Found exact match for author:', authorName);
                    profileUrl = exactMatch.info.url;
                } else {
                    const partialMatch = data.result.hits.hit.find(hit => {
                        const hitAuthorName = hit.info.author;
                        return this.matchAuthorWithInitials(hitAuthorName, authorName);
                    });

                    if (partialMatch) {
                        this.debug('Found partial match for author:', authorName);
                        profileUrl = partialMatch.info.url;
                    } else {
                        this.debug('Using search URL as fallback for author:', authorName);
                        profileUrl = `https://dblp.org/search/author?q=${encodeURIComponent(authorName)}`;
                    }
                }
            } else {
                this.debug('No hits found for author:', authorName);
                profileUrl = `https://dblp.org/search/author?q=${encodeURIComponent(authorName)}`;
            }

            if (!this.authorUrlCache) {
                this.authorUrlCache = new Map();
            }
            this.authorUrlCache.set(authorName, profileUrl);
            this.debug('Cached profile URL for author:', authorName, profileUrl);

            return profileUrl;

        } catch (error) {
            this.debug('Error fetching author profile:', error);
            return `https://dblp.org/search/author?q=${encodeURIComponent(authorName)}`;
        }
    }

    normalizeAuthorName(name) {
        return name.trim().toLowerCase()
            .replace(/\s*\.\s*/g, ' ')
            .replace(/\s+/g, ' ');
    }

    matchAuthorWithInitials(name1, name2) {
        const norm1 = this.normalizeAuthorName(name1);
        const norm2 = this.normalizeAuthorName(name2);
        const parts1 = norm1.split(' ');
        const parts2 = norm2.split(' ');

        if (parts1[parts1.length - 1] !== parts2[parts2.length - 1]) {
            return false;
        }

        const initials1 = parts1.slice(0, -1).map(part => part[0]);
        const initials2 = parts2.slice(0, -1).map(part => part[0]);

        return initials1.join('') === initials2.join('');
    }

    debug(...args) {
        if (this.debugMode && console && console.log) {
            console.log('[PublicationManager]:', ...args);
        }
    }

    async createPublicationItem(pub) {
        const item = document.createElement('div');
        const highlightedTitle = this.highlightSearch(pub.title);

        const authorLinksPromises = pub.authors.map(async (author) => {
            const link = document.createElement('a');
            link.textContent = author;
            link.className = 'author-link loading';

            try {
                const profileUrl = await this.getAuthorProfileURL(author);
                link.href = profileUrl;
                link.target = "_blank";
                link.className = 'author-link';
                return link.outerHTML;
            } catch (error) {
                console.error(`Error creating author link for ${author}:`, error);
                return `<span class="author-link error">${author}</span>`;
            }
        });

        const authorsHTML = await Promise.all(authorLinksPromises).then(links => links.join(', '));

        item.className = 'publication-item';
        item.innerHTML = `
            <h3>${highlightedTitle}</h3>
            <p><strong>Authors:</strong> ${authorsHTML}</p>
            <p><strong>Year:</strong> ${pub.year || 'N/A'}</p>
            <p><strong>Type:</strong> ${this.formatPublicationType(pub.type)}</p>
            ${pub.venue ? `<p><strong>Venue:</strong> ${pub.venue}</p>` : ''}
            ${pub.institution ? `<p><strong>Institution:</strong> ${pub.institution}</p>` : ''}
            ${pub.doi ? `<p><strong>DOI:</strong> <a href="https://doi.org/${pub.doi}" target="_blank">${pub.doi}</a></p>` : ''}
        `;
        return item;
    }

    highlightSearch(content) {
        const searchName = document.getElementById('authorName').value.trim();
        if (!searchName) return content;
        const escapedSearchName = searchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b(${escapedSearchName})\\b`, 'gi');
        const parts = searchName.split(/\s+/);
        const highlightedText = content.replace(regex, '<span class="highlight">$1</span>');
        if (parts.some(part => part.endsWith('.'))) {
            const initialsPattern = parts.map(part => {
                if (part.endsWith('.')) {
                    return `${part}?\\s*`;
                }
                return `\\b${part}\\b`;
            }).join('\\s*');
            const initialsRegex = new RegExp(initialsPattern, 'gi');
            return content.replace(initialsRegex, match => `<span class="highlight">${match}</span>`);
        }

        return highlightedText;
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

    exportToPDF() {
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            let y = 10;
            let currentGroup = '';

            this.filteredPublications.forEach(pub => {
                if (pub.isGroupHeader) {
                    currentGroup = pub.value;
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(12);
                    doc.text(currentGroup, 10, y);
                    y += 10;
                } else {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(10);

                    doc.text(`Title: ${pub.title}`, 10, y);
                    y += 6;
                    doc.text(`Authors: ${pub.authors.join(', ')}`, 10, y);
                    y += 6;
                    doc.text(`Year: ${pub.year || 'N/A'}`, 10, y);
                    y += 6;

                    doc.text(`Type: ${this.formatPublicationType(pub.type)}`, 10, y);
                    y += 6;

                    if (pub.venue) {
                        doc.text(`Venue: ${pub.venue}`, 10, y);
                        y += 6;
                    }

                    if (pub.doi) {
                        const doiURL = `https://doi.org/${pub.doi}`;
                        doc.setTextColor(0, 0, 255);
                        doc.textWithLink(`DOI: ${pub.doi}`, 10, y, { url: doiURL });
                        doc.setTextColor(0, 0, 0);
                        y += 10;
                    }

                    y += 4;
                    if (y > 270) {
                        doc.addPage();
                        y = 10;
                    }
                }
            });
            doc.save('Publications.pdf');
        } catch (error) {
            console.error('Error exporting to PDF:', error);
            this.showError('Error exporting to PDF. Please try again later.');
        }
    }

    exportToBib() {
        try {
            let bibContent = ''; // To hold the .bib file content

            this.filteredPublications.forEach(pub => {
                // Determine entry type (defaulting to 'article')
                //  const entryType = pub.type === 'article' ? 'article' : 'misc';
                const entryType = 'article'

                // Safely generate an ID for the BibTeX entry
                const id = pub.doi
                    ? pub.doi.split('/').pop()
                    : pub.title
                        ? pub.title.replace(/\s+/g, '_').toLowerCase()
                        : `entry_${Math.random().toString(36).substr(2, 8)}`;

                // Build the BibTeX entry
                let bibEntry = `@${entryType}{DBLP:${id},\n`;
                if (pub.authors && pub.authors.length > 0) {
                    bibEntry += `  author       = {${pub.authors.join(' and ')}},\n`;
                }
                if (pub.title) {
                    bibEntry += `  title        = {${pub.title}},\n`;
                }
                if (pub.venue) {
                    bibEntry += `  journal      = {${pub.venue}},\n`;
                }
                if (pub.volume) {
                    bibEntry += `  volume       = {${pub.volume}},\n`;
                }
                if (pub.year) {
                    bibEntry += `  year         = {${pub.year}},\n`;
                }
                if (pub.url) {
                    bibEntry += `  url          = {${pub.url}},\n`;
                }
                if (pub.doi) {
                    bibEntry += `  doi          = {${pub.doi}},\n`;
                }
                if (pub.eprinttype) {
                    bibEntry += `  eprinttype   = {${pub.eprinttype}},\n`;
                }
                if (pub.eprint) {
                    bibEntry += `  eprint       = {${pub.eprint}},\n`;
                }
                if (pub.timestamp) {
                    bibEntry += `  timestamp    = {${pub.timestamp}},\n`;
                }
                if (pub.biburl) {
                    bibEntry += `  biburl       = {${pub.biburl}},\n`;
                }
                if (pub.bibsource) {
                    bibEntry += `  bibsource    = {${pub.bibsource}},\n`;
                }
                bibEntry += '}\n\n';

                bibContent += bibEntry; // Append this entry to the full content
            });

            // Create a Blob with the BibTeX content
            const blob = new Blob([bibContent], { type: 'text/plain;charset=utf-8' });

            // Create a link element to trigger the download
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'Publications.bib';

            // Trigger the download
            link.click();
            URL.revokeObjectURL(link.href);
        } catch (error) {
            console.error('Error exporting to .bib:', error);
            this.showError('Error exporting to .bib. Please try again later.');
        }
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

const yearInput = document.getElementById('filterYear');
const debouncedUpdate = manager.debounce(() => manager.updateDisplay(), 300);
yearInput.addEventListener('input', debouncedUpdate);