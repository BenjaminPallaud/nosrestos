/* ═══════════════════════════════════════
   Nos Restos — Application
   ═══════════════════════════════════════ */

let map;
let placesService;
let autocompleteService;
let markers = [];
let restaurants = [];
let searchTimeout;
let pendingPhotos = [];

const STORAGE_KEY = 'nos-restos-data';
const COUPLE_PHOTO_KEY = 'nos-restos-couple-photo';

// ─── Init ───

function initMap() {
    // Default center: Paris
    const center = { lat: 48.8566, lng: 2.3522 };

    map = new google.maps.Map(document.getElementById('map'), {
        center: center,
        zoom: 12,
        styles: getMapStyles(),
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
    });

    placesService = new google.maps.places.PlacesService(map);
    autocompleteService = new google.maps.places.AutocompleteService();

    loadRestaurants();
    setupSearch();
    setupModals();
    setupCouplePhoto();
    renderRestaurants();
    updateMapMarkers();
    fitMapToMarkers();
}

// ─── Map Styles (elegant muted tones) ───

function getMapStyles() {
    return [
        { elementType: 'geometry', stylers: [{ color: '#f5f0e8' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#6B5555' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f0e8' }] },
        { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#d4b96a' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#e8ddd0' }] },
        { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#ddd0c0' }] },
        { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#e8e0d4' }] },
        { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#d8e0c8' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c8d8e8' }] },
        { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
    ];
}

// ─── Heart Marker SVG ───

function createHeartMarkerIcon() {
    return {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="24" viewBox="0 0 36 40">
                <defs>
                    <filter id="shadow" x="-20%" y="-10%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.25"/>
                    </filter>
                </defs>
                <path d="M18 36 C5 24, 0 16, 0 11 A9 9 0 0 1 18 6 A9 9 0 0 1 36 11 C36 16, 31 24, 18 36Z"
                      fill="#6B2D3E" stroke="#C9A84C" stroke-width="1.5" filter="url(#shadow)"/>
                <path d="M18 32 C8 22, 4 16, 4 12 A7 7 0 0 1 18 8 A7 7 0 0 1 32 12 C32 16, 28 22, 18 32Z"
                      fill="#8B3A4F" opacity="0.5"/>
            </svg>
        `),
        scaledSize: new google.maps.Size(22, 24),
        anchor: new google.maps.Point(11, 23),
    };
}

// ─── Couple Photo Medallion ───

function setupCouplePhoto() {
    const medallion = document.getElementById('couple-medallion');
    const input = document.getElementById('couple-photo-input');
    const img = document.getElementById('couple-photo');
    const placeholder = document.getElementById('couple-placeholder');

    // Load saved photo
    const savedPhoto = localStorage.getItem(COUPLE_PHOTO_KEY);
    if (savedPhoto) {
        img.src = savedPhoto;
        img.classList.remove('hidden');
        placeholder.classList.add('hidden');
    }

    medallion.addEventListener('click', () => input.click());

    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            // Resize for localStorage efficiency
            resizeImage(ev.target.result, 300, (resized) => {
                img.src = resized;
                img.classList.remove('hidden');
                placeholder.classList.add('hidden');
                localStorage.setItem(COUPLE_PHOTO_KEY, resized);
            });
        };
        reader.readAsDataURL(file);
    });
}

function resizeImage(dataUrl, maxSize, callback) {
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > h) { if (w > maxSize) { h = h * maxSize / w; w = maxSize; } }
        else { if (h > maxSize) { w = w * maxSize / h; h = maxSize; } }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        callback(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = dataUrl;
}

// ─── Search ───

function setupSearch() {
    const input = document.getElementById('search-input');
    const resultsEl = document.getElementById('search-results');

    input.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const query = input.value.trim();

        if (query.length < 2) {
            resultsEl.classList.add('hidden');
            return;
        }

        searchTimeout = setTimeout(() => {
            searchPlaces(query);
        }, 350);
    });

    input.addEventListener('focus', () => {
        if (resultsEl.children.length > 0 && input.value.trim().length >= 2) {
            resultsEl.classList.remove('hidden');
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            resultsEl.classList.add('hidden');
        }
    });
}

function searchPlaces(query) {
    const request = {
        input: query,
        types: ['restaurant', 'cafe', 'bar', 'food'],
        componentRestrictions: { country: 'fr' },
    };

    // If map has a center, use location bias
    if (map) {
        request.location = map.getCenter();
        request.radius = 50000;
    }

    autocompleteService.getPlacePredictions(request, (predictions, status) => {
        const resultsEl = document.getElementById('search-results');

        if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions) {
            resultsEl.classList.add('hidden');
            return;
        }

        resultsEl.innerHTML = '';
        predictions.forEach(pred => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `
                <div class="search-result-name">${pred.structured_formatting.main_text}</div>
                <div class="search-result-address">${pred.structured_formatting.secondary_text || ''}</div>
            `;
            item.addEventListener('click', () => {
                selectPlace(pred.place_id);
                resultsEl.classList.add('hidden');
                document.getElementById('search-input').value = '';
            });
            resultsEl.appendChild(item);
        });

        resultsEl.classList.remove('hidden');
    });
}

function selectPlace(placeId) {
    const request = {
        placeId: placeId,
        fields: [
            'name', 'formatted_address', 'geometry', 'rating', 'user_ratings_total',
            'photos', 'types', 'formatted_phone_number', 'website',
            'opening_hours', 'price_level', 'place_id', 'reviews'
        ]
    };

    placesService.getDetails(request, (place, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK) return;
        showAddModal(place);
    });
}

// ─── Add Modal ───

function showAddModal(place) {
    pendingPhotos = [];
    const modal = document.getElementById('add-modal');
    const body = document.getElementById('add-modal-body');

    const photoUrl = place.photos && place.photos.length > 0
        ? place.photos[0].getUrl({ maxWidth: 700 })
        : '';

    const stars = place.rating ? '★'.repeat(Math.round(place.rating)) + '☆'.repeat(5 - Math.round(place.rating)) : '';
    const ratingText = place.rating ? `${stars} ${place.rating}/5 (${place.user_ratings_total || 0} avis)` : '';

    const cuisine = extractCuisineType(place.types);
    const priceLevel = place.price_level ? '€'.repeat(place.price_level) : '';

    let hoursHtml = '';
    if (place.opening_hours && place.opening_hours.weekday_text) {
        hoursHtml = `
            <details class="add-preview-hours">
                <summary>Horaires d'ouverture</summary>
                <ul>${place.opening_hours.weekday_text.map(h => `<li>${h}</li>`).join('')}</ul>
            </details>
        `;
    }

    const today = new Date().toISOString().split('T')[0];

    body.innerHTML = `
        <div class="add-preview">
            ${photoUrl ? `<img class="add-preview-image" src="${photoUrl}" alt="${place.name}">` : ''}
            <div class="add-preview-body">
                <div class="add-preview-name">${place.name}</div>
                ${ratingText ? `<div class="add-preview-rating">${ratingText}</div>` : ''}
                ${cuisine ? `<div class="add-preview-cuisine">${cuisine}${priceLevel ? ' · ' + priceLevel : ''}</div>` : (priceLevel ? `<div class="add-preview-cuisine">${priceLevel}</div>` : '')}
                <div class="add-preview-address">${place.formatted_address || ''}</div>
                ${place.formatted_phone_number ? `<div class="add-preview-phone">📞 ${place.formatted_phone_number}</div>` : ''}
                ${place.website ? `<a class="add-preview-website" href="${place.website}" target="_blank">Voir le site web</a><br>` : ''}
                ${hoursHtml}

                <hr class="add-separator">

                <div class="add-form-group">
                    <label>Date de la visite</label>
                    <input type="date" id="add-date" value="${today}">
                </div>

                <div class="add-form-group">
                    <label>Notre commentaire</label>
                    <textarea id="add-comment" placeholder="Un moment inoubliable..."></textarea>
                </div>

                <div class="add-form-group">
                    <label>Nos photos</label>
                    <div class="photo-upload-area" id="photo-upload-area">
                        <div class="upload-icon">📸</div>
                        <p>Cliquez ou glissez vos photos ici</p>
                        <input type="file" id="photo-input" multiple accept="image/*">
                    </div>
                    <div class="photo-previews" id="photo-previews"></div>
                </div>

                <button class="btn-add-restaurant" id="btn-save-restaurant">
                    ♥ Ajouter à nos adresses
                </button>
            </div>
        </div>
    `;

    // Store place data
    modal.dataset.place = JSON.stringify({
        placeId: place.place_id,
        name: place.name,
        address: place.formatted_address,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        rating: place.rating,
        ratingsTotal: place.user_ratings_total,
        photo: photoUrl,
        cuisine: cuisine,
        priceLevel: place.price_level,
        phone: place.formatted_phone_number || '',
        website: place.website || '',
        hours: place.opening_hours ? place.opening_hours.weekday_text : [],
    });

    // Photo upload
    const uploadArea = document.getElementById('photo-upload-area');
    const photoInput = document.getElementById('photo-input');

    uploadArea.addEventListener('click', () => photoInput.click());
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.borderColor = '#C9A84C'; });
    uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = ''; });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '';
        handlePhotoFiles(e.dataTransfer.files);
    });
    photoInput.addEventListener('change', (e) => handlePhotoFiles(e.target.files));

    // Save button
    document.getElementById('btn-save-restaurant').addEventListener('click', () => {
        saveNewRestaurant(modal);
    });

    modal.classList.remove('hidden');
}

function handlePhotoFiles(files) {
    Array.from(files).forEach(file => {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            pendingPhotos.push(e.target.result);
            renderPhotoPreviews();
        };
        reader.readAsDataURL(file);
    });
}

function renderPhotoPreviews() {
    const container = document.getElementById('photo-previews');
    if (!container) return;
    container.innerHTML = pendingPhotos.map((src, i) => `
        <div class="photo-preview-thumb">
            <img src="${src}" alt="Photo ${i + 1}">
            <button class="remove-photo" onclick="removePendingPhoto(${i})">✕</button>
        </div>
    `).join('');
}

function removePendingPhoto(index) {
    pendingPhotos.splice(index, 1);
    renderPhotoPreviews();
}

function saveNewRestaurant(modal) {
    const placeData = JSON.parse(modal.dataset.place);
    const comment = document.getElementById('add-comment').value.trim();
    const date = document.getElementById('add-date').value;

    const restaurant = {
        id: Date.now().toString(),
        ...placeData,
        comment: comment,
        date: date,
        userPhotos: [...pendingPhotos],
        addedAt: new Date().toISOString(),
    };

    restaurants.push(restaurant);
    saveRestaurants();
    renderRestaurants();
    updateMapMarkers();
    fitMapToMarkers();

    modal.classList.add('hidden');
    pendingPhotos = [];
}

// ─── Detail Modal ───

function showDetailModal(restaurantId) {
    const r = restaurants.find(r => r.id === restaurantId);
    if (!r) return;

    const modal = document.getElementById('detail-modal');
    const body = document.getElementById('modal-body');

    const stars = r.rating ? '★'.repeat(Math.round(r.rating)) + '☆'.repeat(5 - Math.round(r.rating)) : '';
    const ratingText = r.rating ? `${stars} ${r.rating}/5 (${r.ratingsTotal || 0} avis)` : '';
    const priceLevel = r.priceLevel ? '€'.repeat(r.priceLevel) : '';

    let hoursHtml = '';
    if (r.hours && r.hours.length > 0) {
        hoursHtml = `
            <details class="detail-hours">
                <summary>Horaires d'ouverture</summary>
                <ul>${r.hours.map(h => `<li>${h}</li>`).join('')}</ul>
            </details>
        `;
    }

    const dateFormatted = r.date ? new Date(r.date + 'T00:00:00').toLocaleDateString('fr-FR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    }) : '';

    body.innerHTML = `
        ${r.photo ? `<img class="detail-header-image" src="${r.photo}" alt="${r.name}">` : ''}
        <div class="detail-body">
            <div class="detail-name">${r.name}</div>
            ${ratingText ? `<div class="detail-rating">${ratingText}</div>` : ''}
            ${r.cuisine ? `<div class="detail-cuisine">${r.cuisine}${priceLevel ? ' · ' + priceLevel : ''}</div>` : (priceLevel ? `<div class="detail-cuisine">${priceLevel}</div>` : '')}
            <div class="detail-info" style="font-style: italic;">${r.address || ''}</div>
            ${r.phone ? `<div class="detail-info">📞 ${r.phone}</div>` : ''}
            ${r.website ? `<div class="detail-info"><a href="${r.website}" target="_blank">Voir le site web</a></div>` : ''}
            ${hoursHtml}
            ${dateFormatted ? `<div class="detail-date">♥ Visité le ${dateFormatted}</div>` : ''}

            <hr class="detail-separator">

            <div class="detail-comment-section">
                <h3>Notre avis</h3>
                ${r.comment
                    ? `<div class="detail-comment">${escapeHtml(r.comment)}</div>`
                    : `<p style="color: var(--text-light); font-style: italic;">Pas encore de commentaire</p>`
                }
                <textarea class="detail-comment-edit" id="detail-comment-edit" placeholder="Ajouter ou modifier notre commentaire...">${r.comment || ''}</textarea>
                <button class="btn-small" onclick="updateComment('${r.id}')">Enregistrer</button>
            </div>

            <hr class="detail-separator">

            <div class="detail-photos-section">
                <h3>Nos photos</h3>
                <div class="detail-photos-grid" id="detail-photos-grid">
                    ${(r.userPhotos || []).map((src, i) => `
                        <div class="detail-photo">
                            <img src="${src}" alt="Photo ${i + 1}" onclick="showFullscreenImage('${src.replace(/'/g, "\\'")}')">
                            <button class="remove-detail-photo" onclick="removePhoto('${r.id}', ${i})">✕</button>
                        </div>
                    `).join('')}
                </div>
                <div class="detail-add-photos">
                    <input type="file" id="detail-photo-input" multiple accept="image/*" style="display:none">
                    <button class="btn-small btn-outline" onclick="document.getElementById('detail-photo-input').click()">
                        📸 Ajouter des photos
                    </button>
                </div>
            </div>
        </div>
    `;

    // Detail photo upload
    document.getElementById('detail-photo-input').addEventListener('change', (e) => {
        Array.from(e.target.files).forEach(file => {
            if (!file.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (!r.userPhotos) r.userPhotos = [];
                r.userPhotos.push(ev.target.result);
                saveRestaurants();
                showDetailModal(r.id); // refresh
            };
            reader.readAsDataURL(file);
        });
    });

    modal.classList.remove('hidden');
}

function updateComment(restaurantId) {
    const r = restaurants.find(r => r.id === restaurantId);
    if (!r) return;
    const textarea = document.getElementById('detail-comment-edit');
    r.comment = textarea.value.trim();
    saveRestaurants();
    renderRestaurants();
    showDetailModal(restaurantId); // refresh
}

function removePhoto(restaurantId, photoIndex) {
    const r = restaurants.find(r => r.id === restaurantId);
    if (!r || !r.userPhotos) return;
    r.userPhotos.splice(photoIndex, 1);
    saveRestaurants();
    showDetailModal(restaurantId);
    renderRestaurants();
}

function showFullscreenImage(src) {
    const overlay = document.createElement('div');
    overlay.className = 'fullscreen-image-overlay';
    overlay.innerHTML = `<img src="${src}" alt="Photo">`;
    overlay.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
}

function deleteRestaurant(id, e) {
    e.stopPropagation();
    if (!confirm('Retirer ce restaurant de notre liste ?')) return;
    restaurants = restaurants.filter(r => r.id !== id);
    saveRestaurants();
    renderRestaurants();
    updateMapMarkers();
    fitMapToMarkers();
}

// ─── Modals Setup ───

function setupModals() {
    // Close buttons
    document.getElementById('modal-close').addEventListener('click', () => {
        document.getElementById('detail-modal').classList.add('hidden');
    });
    document.getElementById('add-modal-close').addEventListener('click', () => {
        document.getElementById('add-modal').classList.add('hidden');
    });

    // Overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', () => {
            overlay.parentElement.classList.add('hidden');
        });
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
            document.querySelectorAll('.fullscreen-image-overlay').forEach(o => o.remove());
        }
    });
}

// ─── Render ───

function renderRestaurants() {
    const grid = document.getElementById('restaurants-grid');
    const empty = document.getElementById('empty-state');

    if (restaurants.length === 0) {
        grid.innerHTML = '';
        grid.appendChild(createEmptyState());
        return;
    }

    // Sort by date descending
    const sorted = [...restaurants].sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return b.date.localeCompare(a.date);
    });

    grid.innerHTML = sorted.map(r => {
        const stars = r.rating ? '★'.repeat(Math.round(r.rating)) + '☆'.repeat(5 - Math.round(r.rating)) : '';
        const dateFormatted = r.date ? new Date(r.date + 'T00:00:00').toLocaleDateString('fr-FR', {
            day: 'numeric', month: 'long', year: 'numeric'
        }) : '';
        const photoCount = (r.userPhotos || []).length;

        return `
            <div class="restaurant-card" onclick="showDetailModal('${r.id}')">
                <div class="card-image">
                    ${r.photo
                        ? `<img src="${r.photo}" alt="${r.name}" loading="lazy">`
                        : `<div style="width:100%;height:100%;background:linear-gradient(135deg, var(--burgundy), var(--gold));display:flex;align-items:center;justify-content:center;color:var(--cream);font-size:3rem;">🍷</div>`
                    }
                    <div class="card-image-overlay"></div>
                    <div class="card-heart">♥</div>
                    <button class="card-delete-btn" onclick="deleteRestaurant('${r.id}', event)" title="Retirer">🗑</button>
                    ${stars ? `<div class="card-rating">${stars}</div>` : ''}
                </div>
                <div class="card-body">
                    <div class="card-name">${r.name}</div>
                    ${r.cuisine ? `<div class="card-cuisine">${r.cuisine}</div>` : ''}
                    <div class="card-address">${r.address || ''}</div>
                    ${dateFormatted ? `<div class="card-date">♥ ${dateFormatted}</div>` : ''}
                    ${r.comment ? `<div class="card-comment-preview">"${escapeHtml(r.comment)}"</div>` : ''}
                    ${photoCount > 0 ? `<div class="card-photos-count">📸 ${photoCount} photo${photoCount > 1 ? 's' : ''}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function createEmptyState() {
    const div = document.createElement('div');
    div.id = 'empty-state';
    div.className = 'empty-state';
    div.innerHTML = `
        <div class="empty-heart">♥</div>
        <p>Aucun restaurant pour le moment</p>
        <p class="empty-hint">Recherchez votre premier restaurant ci-dessus</p>
    `;
    return div;
}

// ─── Map Markers ───

function updateMapMarkers() {
    // Clear existing
    markers.forEach(m => m.setMap(null));
    markers = [];

    const heartIcon = createHeartMarkerIcon();

    restaurants.forEach(r => {
        if (!r.lat || !r.lng) return;

        const marker = new google.maps.Marker({
            position: { lat: r.lat, lng: r.lng },
            map: map,
            icon: heartIcon,
            title: r.name,
            animation: google.maps.Animation.DROP,
        });

        const infoContent = `
            <div style="font-family:'Cormorant Garamond',serif;padding:5px;max-width:220px;">
                <strong style="font-family:'Playfair Display',serif;color:#6B2D3E;font-size:1.05rem;">${r.name}</strong>
                ${r.cuisine ? `<br><span style="color:#C9A84C;font-size:0.85rem;text-transform:uppercase;letter-spacing:0.08em;">${r.cuisine}</span>` : ''}
                ${r.date ? `<br><span style="color:#E8C4C4;font-size:0.85rem;">♥ ${new Date(r.date + 'T00:00:00').toLocaleDateString('fr-FR')}</span>` : ''}
            </div>
        `;

        const infoWindow = new google.maps.InfoWindow({ content: infoContent });

        marker.addListener('click', () => {
            infoWindow.open(map, marker);
        });

        markers.push(marker);
    });
}

function fitMapToMarkers() {
    if (markers.length === 0) return;

    if (markers.length === 1) {
        map.setCenter(markers[0].getPosition());
        map.setZoom(14);
        return;
    }

    const bounds = new google.maps.LatLngBounds();
    markers.forEach(m => bounds.extend(m.getPosition()));
    map.fitBounds(bounds, { padding: 60 });
}

// ─── Storage ───

function loadRestaurants() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        restaurants = data ? JSON.parse(data) : [];
    } catch {
        restaurants = [];
    }
}

function saveRestaurants() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(restaurants));
}

// ─── Helpers ───

function extractCuisineType(types) {
    if (!types) return '';
    const cuisineMap = {
        'restaurant': 'Restaurant',
        'cafe': 'Café',
        'bar': 'Bar',
        'bakery': 'Boulangerie',
        'meal_delivery': 'Livraison',
        'meal_takeaway': 'À emporter',
        'night_club': 'Club',
    };

    for (const type of types) {
        if (cuisineMap[type]) return cuisineMap[type];
    }
    return '';
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
