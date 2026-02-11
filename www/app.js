(function () {
    'use strict';

    // Default center: Seoul
    const DEFAULT_CENTER = [35.510, 129.4275];
    const DEFAULT_ZOOM = 15;

    // State
    let map;
    let locationMarker;
    let accuracyCircle;
    let trackingPath;
    let trackPoints = [];
    let watchId = null;
    let isTracking = false;
    let totalDistance = 0;

    // Building draw state
    let isDrawing = false;
    let drawPoints = [];
    let drawMarkers = [];
    let drawPolyline = null;
    let drawPreviewPolygon = null;
    let buildings = [];        // { id, name, desc, color, points, polygon }
    let selectedColor = '#e53e3e';

    // DOM elements
    const btnLocate = document.getElementById('btn-locate');
    const btnTrack = document.getElementById('btn-track');
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const infoPanel = document.getElementById('info-panel');
    const btnCloseInfo = document.getElementById('btn-close-info');
    const toastEl = document.getElementById('toast');

    // Info display elements
    const infoLat = document.getElementById('info-lat');
    const infoLng = document.getElementById('info-lng');
    const infoAccuracy = document.getElementById('info-accuracy');
    const infoAltitude = document.getElementById('info-altitude');
    const infoSpeed = document.getElementById('info-speed');
    const infoDistance = document.getElementById('info-distance');

    // Custom icon for current location
    const locationIcon = L.divIcon({
        className: '',
        html: '<div class="location-pulse"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
    });

    function initMap() {
        map = L.map('map', {
            center: DEFAULT_CENTER,
            zoom: DEFAULT_ZOOM,
            zoomControl: false,
            maxZoom: 21,
            minZoom: 10,
        });

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap',
            maxNativeZoom: 19,
            maxZoom: 21,
            minZoom: 10,
        }).addTo(map);

        trackingPath = L.polyline([], {
            color: '#2563eb',
            weight: 4,
            opacity: 0.7,
            smoothFactor: 1,
        }).addTo(map);
    }

    function showToast(message) {
        toastEl.textContent = message;
        toastEl.classList.remove('hidden');
        clearTimeout(toastEl._timeout);
        toastEl._timeout = setTimeout(function () {
            toastEl.classList.add('hidden');
        }, 3000);
    }

    function updateInfoPanel(coords) {
        infoLat.textContent = coords.latitude.toFixed(6) + '°';
        infoLng.textContent = coords.longitude.toFixed(6) + '°';
        infoAccuracy.textContent = coords.accuracy
            ? coords.accuracy.toFixed(1) + ' m'
            : '-';
        infoAltitude.textContent =
            coords.altitude != null
                ? coords.altitude.toFixed(1) + ' m'
                : '-';
        infoSpeed.textContent =
            coords.speed != null
                ? (coords.speed * 3.6).toFixed(1) + ' km/h'
                : '-';
        infoDistance.textContent = formatDistance(totalDistance);
    }

    function formatDistance(meters) {
        if (meters < 1000) {
            return meters.toFixed(0) + ' m';
        }
        return (meters / 1000).toFixed(2) + ' km';
    }

    function haversineDistance(lat1, lon1, lat2, lon2) {
        var R = 6371000; // Earth radius in meters
        var dLat = ((lat2 - lat1) * Math.PI) / 180;
        var dLon = ((lon2 - lon1) * Math.PI) / 180;
        var a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((lat1 * Math.PI) / 180) *
                Math.cos((lat2 * Math.PI) / 180) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    function updateLocation(position) {
        var coords = position.coords;
        var latlng = [coords.latitude, coords.longitude];

        // Update or create marker
        if (locationMarker) {
            locationMarker.setLatLng(latlng);
        } else {
            locationMarker = L.marker(latlng, { icon: locationIcon }).addTo(map);
        }

        // Update accuracy circle
        if (accuracyCircle) {
            accuracyCircle.setLatLng(latlng);
            accuracyCircle.setRadius(coords.accuracy);
        } else {
            accuracyCircle = L.circle(latlng, {
                radius: coords.accuracy,
                color: '#2563eb',
                fillColor: '#2563eb',
                fillOpacity: 0.1,
                weight: 1,
            }).addTo(map);
        }

        // If tracking, add to path and calculate distance
        if (isTracking) {
            if (trackPoints.length > 0) {
                var prev = trackPoints[trackPoints.length - 1];
                var dist = haversineDistance(
                    prev[0],
                    prev[1],
                    latlng[0],
                    latlng[1]
                );
                // Filter out GPS noise (only add if moved more than accuracy)
                if (dist > Math.max(coords.accuracy * 0.5, 3)) {
                    totalDistance += dist;
                    trackPoints.push(latlng);
                    trackingPath.setLatLngs(trackPoints);
                }
            } else {
                trackPoints.push(latlng);
                trackingPath.setLatLngs(trackPoints);
            }
        }

        // Update info panel
        updateInfoPanel(coords);

        // Center map on location
        map.setView(latlng, map.getZoom());
    }

    function handleLocationError(error) {
        var messages = {
            1: 'GPS 권한이 거부되었습니다. 브라우저 설정에서 위치 권한을 허용해주세요.',
            2: '위치 정보를 사용할 수 없습니다.',
            3: '위치 요청 시간이 초과되었습니다.',
        };
        showToast(messages[error.code] || '위치를 가져올 수 없습니다.');
    }

    function locateMe() {
        if (!navigator.geolocation) {
            showToast('이 브라우저에서 GPS를 지원하지 않습니다.');
            return;
        }

        showToast('현재 위치를 찾고 있습니다...');

        navigator.geolocation.getCurrentPosition(
            function (position) {
                updateLocation(position);
                showToast('현재 위치를 찾았습니다.');
            },
            handleLocationError,
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0,
            }
        );
    }

    function toggleTracking() {
        if (!navigator.geolocation) {
            showToast('이 브라우저에서 GPS를 지원하지 않습니다.');
            return;
        }

        if (isTracking) {
            // Stop tracking
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
            isTracking = false;
            btnTrack.classList.remove('active');
            showToast('위치 추적을 중지했습니다.');
        } else {
            // Start tracking
            isTracking = true;
            trackPoints = [];
            totalDistance = 0;
            trackingPath.setLatLngs([]);
            btnTrack.classList.add('active');
            showToast('위치 추적을 시작합니다...');

            watchId = navigator.geolocation.watchPosition(
                updateLocation,
                handleLocationError,
                {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 0,
                }
            );
        }
    }

    // Building draw DOM elements
    const btnDraw = document.getElementById('btn-draw');
    const btnBuildings = document.getElementById('btn-buildings');
    const drawSubTools = document.getElementById('draw-sub-tools');
    const drawHint = document.getElementById('draw-hint');
    const btnUndoPoint = document.getElementById('btn-undo-point');
    const btnFinishDraw = document.getElementById('btn-finish-draw');
    const btnCancelDraw = document.getElementById('btn-cancel-draw');
    const buildingDialog = document.getElementById('building-dialog');
    const buildingNameInput = document.getElementById('building-name');
    const buildingDescInput = document.getElementById('building-desc');
    const dialogCancel = document.getElementById('dialog-cancel');
    const dialogSave = document.getElementById('dialog-save');
    const buildingListPanel = document.getElementById('building-list-panel');
    const btnCloseBuildingList = document.getElementById('btn-close-building-list');
    const buildingListBody = document.getElementById('building-list-body');
    const buildingListEmpty = document.getElementById('building-list-empty');
    const colorOptions = document.querySelectorAll('.color-option');

    // ---- Building Drawing ----

    function startDrawMode() {
        isDrawing = true;
        drawPoints = [];
        drawMarkers = [];
        btnDraw.classList.add('active');
        drawSubTools.classList.remove('hidden');
        renderShapeHistory();
        map.doubleClickZoom.disable();
        showToast('도형을 선택하거나 지도를 터치하세요.');

        // Close other panels
        infoPanel.classList.add('hidden');
        buildingListPanel.classList.add('hidden');
    }

    function stopDrawMode() {
        isDrawing = false;
        btnDraw.classList.remove('active');
        drawHint.classList.add('hidden');
        drawSubTools.classList.add('hidden');
        if (shapeMode) deactivateShape();
        map.doubleClickZoom.enable();
        clearDrawState();
    }

    function clearDrawState() {
        drawMarkers.forEach(function (m) { map.removeLayer(m); });
        drawMarkers = [];
        drawPoints = [];
        if (drawPolyline) { map.removeLayer(drawPolyline); drawPolyline = null; }
        if (drawPreviewPolygon) { map.removeLayer(drawPreviewPolygon); drawPreviewPolygon = null; }
    }

    function addDrawPoint(latlng) {
        drawPoints.push([latlng.lat, latlng.lng]);

        // Show draw hint on first vertex
        if (drawPoints.length === 1) {
            drawHint.classList.remove('hidden');
        }

        // Add vertex marker
        var marker = L.circleMarker(latlng, {
            radius: 6,
            color: '#fff',
            fillColor: selectedColor,
            fillOpacity: 1,
            weight: 2,
        }).addTo(map);
        drawMarkers.push(marker);

        updateDrawPreview();
    }

    function updateDrawPreview() {
        // Update polyline
        if (drawPolyline) { map.removeLayer(drawPolyline); }
        if (drawPreviewPolygon) { map.removeLayer(drawPreviewPolygon); }

        if (drawPoints.length >= 3) {
            drawPreviewPolygon = L.polygon(drawPoints, {
                color: selectedColor,
                fillColor: selectedColor,
                fillOpacity: 0.25,
                weight: 2,
                dashArray: '6,4',
            }).addTo(map);
        } else if (drawPoints.length >= 2) {
            drawPolyline = L.polyline(drawPoints, {
                color: selectedColor,
                weight: 2,
                dashArray: '6,4',
            }).addTo(map);
        }
    }

    function undoLastPoint() {
        if (drawPoints.length === 0) return;
        drawPoints.pop();
        var m = drawMarkers.pop();
        if (m) map.removeLayer(m);
        updateDrawPreview();
    }

    function finishDraw() {
        if (drawPoints.length < 3) {
            showToast('최소 3개의 꼭짓점이 필요합니다.');
            return;
        }
        // Show the name dialog
        buildingNameInput.value = '';
        buildingDescInput.value = '';
        buildingDialog.classList.remove('hidden');
        buildingNameInput.focus();
    }

    function saveBuilding() {
        var name = buildingNameInput.value.trim();
        if (!name) {
            buildingNameInput.style.borderColor = '#e53e3e';
            buildingNameInput.focus();
            return;
        }
        buildingNameInput.style.borderColor = '';

        var building = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name: name,
            desc: buildingDescInput.value.trim(),
            color: selectedColor,
            points: drawPoints.slice(),
        };

        buildings.push(building);
        addBuildingToMap(building);
        saveBuildingsToStorage();
        renderBuildingList();

        buildingDialog.classList.add('hidden');
        stopDrawMode();
        showToast('"' + name + '" 건물이 저장되었습니다.');
    }

    function addBuildingToMap(building) {
        var polygon = L.polygon(building.points, {
            color: building.color,
            fillColor: building.color,
            fillOpacity: 0.3,
            weight: 2,
        }).addTo(map);

        // Permanent name label at center
        polygon.bindTooltip(building.name, {
            permanent: true,
            direction: 'center',
            className: 'building-label',
        });

        polygon.on('click', function () {
            map.panTo(polygon.getBounds().getCenter());
        });

        building.polygon = polygon;
    }

    function removeBuildingById(id) {
        var idx = -1;
        for (var i = 0; i < buildings.length; i++) {
            if (buildings[i].id === id) { idx = i; break; }
        }
        if (idx < 0) return;
        if (buildings[idx].polygon) {
            map.removeLayer(buildings[idx].polygon);
        }
        buildings.splice(idx, 1);
        saveBuildingsToStorage();
        renderBuildingList();
    }

    function saveBuildingsToStorage() {
        var data = buildings.map(function (b) {
            return { id: b.id, name: b.name, desc: b.desc, color: b.color, points: b.points };
        });
        try {
            localStorage.setItem('mmap_buildings', JSON.stringify(data));
        } catch (e) { /* storage full */ }
    }

    function loadBuildingsFromStorage() {
        try {
            var raw = localStorage.getItem('mmap_buildings');
            if (!raw) return;
            var data = JSON.parse(raw);
            if (!Array.isArray(data)) return;
            data.forEach(function (b) {
                if (b.points && b.points.length >= 3) {
                    buildings.push(b);
                    addBuildingToMap(b);
                }
            });
            renderBuildingList();
        } catch (e) { /* corrupt data */ }
    }

    function renderBuildingList() {
        if (buildings.length === 0) {
            buildingListBody.innerHTML = '';
            buildingListBody.appendChild(buildingListEmpty);
            buildingListEmpty.style.display = '';
            return;
        }
        buildingListEmpty.style.display = 'none';
        var html = '';
        buildings.forEach(function (b) {
            html += '<div class="building-item" data-id="' + b.id + '">';
            html += '<div class="building-color-dot" style="background:' + b.color + '"></div>';
            html += '<div class="building-item-info">';
            html += '<div class="building-item-name">' + escapeHtml(b.name) + '</div>';
            if (b.desc) {
                html += '<div class="building-item-desc">' + escapeHtml(b.desc) + '</div>';
            }
            html += '</div>';
            html += '<button class="building-item-delete" data-id="' + b.id + '">&times;</button>';
            html += '</div>';
        });
        buildingListBody.innerHTML = html;

        // Attach event listeners
        var items = buildingListBody.querySelectorAll('.building-item');
        items.forEach(function (item) {
            item.addEventListener('click', function (e) {
                if (e.target.classList.contains('building-item-delete')) return;
                var bid = item.getAttribute('data-id');
                var bld = buildings.find(function (b) { return b.id === bid; });
                if (bld && bld.polygon) {
                    map.panTo(bld.polygon.getBounds().getCenter());
                    buildingListPanel.classList.add('hidden');
                }
            });
        });

        var delBtns = buildingListBody.querySelectorAll('.building-item-delete');
        delBtns.forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var bid = btn.getAttribute('data-id');
                removeBuildingById(bid);
            });
        });
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ---- Shape Drawing ----

    let shapeMode = null; // null | 'rect' | 'circle'
    let shapeState = null; // { cx, cy, w, h, rotation }
    let shapeDrag = null;  // active drag info
    let shapeOriginal = null; // { w, h, rotation } - preset at activation, for history dedup

    const drawPanel = document.getElementById('draw-panel');
    const btnShapeRect = document.getElementById('btn-shape-rect');
    const btnShapeCircle = document.getElementById('btn-shape-circle');
    const shapeHistoryEl = document.getElementById('shape-history');
    const shapeOverlay = document.getElementById('shape-overlay');
    const shapeBody = document.getElementById('shape-body');
    const resizeHandles = document.querySelectorAll('.resize-handle');
    const rotateHandle = document.getElementById('rotate-handle');
    const btnShapeConfirm = document.getElementById('btn-shape-confirm');

    // ---- Shape History ----

    function loadShapeHistory() {
        try {
            var raw = localStorage.getItem('mmap_shape_history');
            if (!raw) return [];
            var data = JSON.parse(raw);
            return Array.isArray(data) ? data.slice(0, 3) : [];
        } catch (e) { return []; }
    }

    function saveShapeHistory(history) {
        try {
            localStorage.setItem('mmap_shape_history', JSON.stringify(history.slice(0, 3)));
        } catch (e) { /* storage full */ }
    }

    function addToShapeHistory(entry) {
        var history = loadShapeHistory();
        history.unshift({ mode: entry.mode, w: Math.round(entry.w), h: Math.round(entry.h), rotation: entry.rotation });
        if (history.length > 3) history.length = 3;
        saveShapeHistory(history);
    }

    function shapePreviewSVG(entry) {
        var maxDim = Math.max(entry.w, entry.h);
        var nw = (entry.w / maxDim) * 14;
        var nh = (entry.h / maxDim) * 14;
        var rot = (entry.rotation * 180 / Math.PI).toFixed(1);
        if (entry.mode === 'rect') {
            return '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="' + (12 - nw / 2) + '" y="' + (12 - nh / 2) + '" width="' + nw + '" height="' + nh + '" fill="none" stroke="currentColor" stroke-width="1.5" rx="0.5" transform="rotate(' + rot + ' 12 12)"/></svg>';
        }
        return '<svg viewBox="0 0 24 24" width="24" height="24"><ellipse cx="12" cy="12" rx="' + (nw / 2) + '" ry="' + (nh / 2) + '" fill="none" stroke="currentColor" stroke-width="1.5" transform="rotate(' + rot + ' 12 12)"/></svg>';
    }

    function renderShapeHistory() {
        var history = loadShapeHistory();
        if (history.length === 0) {
            shapeHistoryEl.innerHTML = '';
            return;
        }
        var html = '<div class="shape-history-divider"></div>';
        history.forEach(function (entry, idx) {
            html += '<button class="shape-history-btn" data-idx="' + idx + '" title="최근 도형 ' + (idx + 1) + '">' + shapePreviewSVG(entry) + '</button>';
        });
        shapeHistoryEl.innerHTML = html;

        // Attach click listeners
        shapeHistoryEl.querySelectorAll('.shape-history-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var i = parseInt(btn.getAttribute('data-idx'));
                var h = loadShapeHistory();
                if (h[i]) {
                    activateShape(h[i].mode, { w: h[i].w, h: h[i].h, rotation: h[i].rotation });
                }
            });
        });
    }

    // ---- Shape Activate / Deactivate ----

    function activateShape(mode, preset) {
        shapeMode = mode;
        btnShapeRect.classList.toggle('active', mode === 'rect');
        btnShapeCircle.classList.toggle('active', mode === 'circle');

        var w = preset ? preset.w : 120;
        var h = preset ? preset.h : 120;
        var rot = preset ? preset.rotation : 0;

        var size = map.getSize();
        shapeState = {
            cx: size.x / 2,
            cy: size.y / 2,
            w: w,
            h: h,
            rotation: rot,
        };

        // Remember original for history dedup (only when from history preset)
        shapeOriginal = preset ? { w: w, h: h, rotation: rot } : null;

        shapeOverlay.classList.remove('hidden');
        shapeBody.classList.toggle('circle', mode === 'circle');

        // Disable map interaction while shape overlay is active
        map.dragging.disable();
        map.touchZoom.disable();
        map.doubleClickZoom.disable();
        map.scrollWheelZoom.disable();

        // Hide draw hint (vertex mode) while in shape mode
        drawHint.classList.add('hidden');

        renderShape();
    }

    function deactivateShape() {
        shapeMode = null;
        shapeState = null;
        shapeDrag = null;
        shapeOriginal = null;
        shapeOverlay.classList.add('hidden');
        btnShapeRect.classList.remove('active');
        btnShapeCircle.classList.remove('active');

        // Re-enable map interaction
        map.dragging.enable();
        map.touchZoom.enable();
        map.scrollWheelZoom.enable();
    }

    function renderShape() {
        if (!shapeState) return;
        var s = shapeState;
        var left = s.cx - s.w / 2;
        var top = s.cy - s.h / 2;

        shapeBody.style.left = left + 'px';
        shapeBody.style.top = top + 'px';
        shapeBody.style.width = s.w + 'px';
        shapeBody.style.height = s.h + 'px';
        shapeBody.style.transform = 'rotate(' + s.rotation + 'rad)';

        // Position resize handles at corners (in rotated space)
        var corners = [
            { pos: 'tl', dx: -s.w / 2, dy: -s.h / 2 },
            { pos: 'tr', dx: s.w / 2, dy: -s.h / 2 },
            { pos: 'br', dx: s.w / 2, dy: s.h / 2 },
            { pos: 'bl', dx: -s.w / 2, dy: s.h / 2 },
        ];
        var cos = Math.cos(s.rotation);
        var sin = Math.sin(s.rotation);

        corners.forEach(function (c) {
            var rx = c.dx * cos - c.dy * sin;
            var ry = c.dx * sin + c.dy * cos;
            var handle = shapeOverlay.querySelector('.resize-handle[data-pos="' + c.pos + '"]');
            if (handle) {
                handle.style.left = (s.cx + rx) + 'px';
                handle.style.top = (s.cy + ry) + 'px';
            }
        });

        // Position rotate handle above the shape
        var rotDx = 0;
        var rotDy = -s.h / 2 - 28;
        var rrx = rotDx * cos - rotDy * sin;
        var rry = rotDx * sin + rotDy * cos;
        rotateHandle.style.left = (s.cx + rrx) + 'px';
        rotateHandle.style.top = (s.cy + rry) + 'px';
    }

    function getPointerPos(e) {
        var touch = e.touches ? e.touches[0] : e;
        return { x: touch.clientX, y: touch.clientY };
    }

    function onShapePointerDown(e) {
        if (!shapeState) return;
        var target = e.target;

        if (target === rotateHandle) {
            var pos = getPointerPos(e);
            e.preventDefault();
            shapeDrag = { type: 'rotate', startAngle: Math.atan2(pos.y - shapeState.cy, pos.x - shapeState.cx), startRotation: shapeState.rotation };
        } else if (target.classList.contains('resize-handle')) {
            var pos = getPointerPos(e);
            e.preventDefault();
            var handlePos = target.getAttribute('data-pos');
            shapeDrag = { type: 'resize', handle: handlePos, startX: pos.x, startY: pos.y, startW: shapeState.w, startH: shapeState.h, startCx: shapeState.cx, startCy: shapeState.cy };
        } else if (target === shapeBody) {
            var pos = getPointerPos(e);
            e.preventDefault();
            shapeDrag = { type: 'move', offsetX: pos.x - shapeState.cx, offsetY: pos.y - shapeState.cy };
        }
        // Do NOT preventDefault for other targets (e.g. confirm button)
    }

    function onShapePointerMove(e) {
        if (!shapeDrag || !shapeState) return;
        var pos = getPointerPos(e);
        e.preventDefault();

        if (shapeDrag.type === 'move') {
            shapeState.cx = pos.x - shapeDrag.offsetX;
            shapeState.cy = pos.y - shapeDrag.offsetY;
        } else if (shapeDrag.type === 'resize') {
            // Calculate delta in rotated coordinate system
            var dx = pos.x - shapeDrag.startX;
            var dy = pos.y - shapeDrag.startY;
            var cos = Math.cos(-shapeState.rotation);
            var sin = Math.sin(-shapeState.rotation);
            var ldx = dx * cos - dy * sin;
            var ldy = dx * sin + dy * cos;

            var h = shapeDrag.handle;
            var newW = shapeDrag.startW;
            var newH = shapeDrag.startH;

            if (h === 'tr' || h === 'br') newW = Math.max(20, shapeDrag.startW + ldx);
            if (h === 'tl' || h === 'bl') newW = Math.max(20, shapeDrag.startW - ldx);
            if (h === 'bl' || h === 'br') newH = Math.max(20, shapeDrag.startH + ldy);
            if (h === 'tl' || h === 'tr') newH = Math.max(20, shapeDrag.startH - ldy);

            // Adjust center so the opposite corner stays fixed
            var dw = newW - shapeDrag.startW;
            var dh = newH - shapeDrag.startH;
            var cosR = Math.cos(shapeState.rotation);
            var sinR = Math.sin(shapeState.rotation);
            var shiftX = 0, shiftY = 0;

            if (h === 'tr' || h === 'br') shiftX += dw / 2;
            if (h === 'tl' || h === 'bl') shiftX -= dw / 2;
            if (h === 'bl' || h === 'br') shiftY += dh / 2;
            if (h === 'tl' || h === 'tr') shiftY -= dh / 2;

            shapeState.cx = shapeDrag.startCx + shiftX * cosR - shiftY * sinR;
            shapeState.cy = shapeDrag.startCy + shiftX * sinR + shiftY * cosR;
            shapeState.w = newW;
            shapeState.h = newH;
        } else if (shapeDrag.type === 'rotate') {
            var angle = Math.atan2(pos.y - shapeState.cy, pos.x - shapeState.cx);
            shapeState.rotation = shapeDrag.startRotation + (angle - shapeDrag.startAngle);
        }

        renderShape();
    }

    function onShapePointerUp() {
        shapeDrag = null;
    }

    function confirmShape() {
        if (!shapeState || !shapeMode) return;
        var s = shapeState;
        var pts = [];

        if (shapeMode === 'rect') {
            // 4 corners with rotation
            var corners = [
                [-s.w / 2, -s.h / 2],
                [s.w / 2, -s.h / 2],
                [s.w / 2, s.h / 2],
                [-s.w / 2, s.h / 2],
            ];
            var cos = Math.cos(s.rotation);
            var sin = Math.sin(s.rotation);
            corners.forEach(function (c) {
                var rx = c[0] * cos - c[1] * sin;
                var ry = c[0] * sin + c[1] * cos;
                var px = s.cx + rx;
                var py = s.cy + ry;
                var latlng = map.containerPointToLatLng(L.point(px, py));
                pts.push([latlng.lat, latlng.lng]);
            });
        } else if (shapeMode === 'circle') {
            // Approximate ellipse with 32 points (rotation applied)
            var rx = s.w / 2;
            var ry = s.h / 2;
            var cos = Math.cos(s.rotation);
            var sin = Math.sin(s.rotation);
            for (var i = 0; i < 32; i++) {
                var angle = (2 * Math.PI * i) / 32;
                var lx = rx * Math.cos(angle);
                var ly = ry * Math.sin(angle);
                var px = s.cx + lx * cos - ly * sin;
                var py = s.cy + lx * sin + ly * cos;
                var latlng = map.containerPointToLatLng(L.point(px, py));
                pts.push([latlng.lat, latlng.lng]);
            }
        }

        // Save shape to history (skip if loaded from history and unchanged)
        var isDuplicate = shapeOriginal &&
            Math.round(s.w) === Math.round(shapeOriginal.w) &&
            Math.round(s.h) === Math.round(shapeOriginal.h) &&
            Math.abs(s.rotation - shapeOriginal.rotation) < 0.01;
        if (!isDuplicate) {
            addToShapeHistory({ mode: shapeMode, w: s.w, h: s.h, rotation: s.rotation });
        }

        // Set drawPoints and trigger finishDraw flow
        drawPoints = pts;
        deactivateShape();
        finishDraw();
    }

    // Shape overlay touch/mouse events
    shapeOverlay.addEventListener('mousedown', onShapePointerDown);
    shapeOverlay.addEventListener('touchstart', onShapePointerDown, { passive: false });
    document.addEventListener('mousemove', onShapePointerMove);
    document.addEventListener('touchmove', onShapePointerMove, { passive: false });
    document.addEventListener('mouseup', onShapePointerUp);
    document.addEventListener('touchend', onShapePointerUp);

    btnShapeRect.addEventListener('click', function () {
        if (shapeMode === 'rect') {
            deactivateShape();
        } else {
            activateShape('rect');
        }
    });

    btnShapeCircle.addEventListener('click', function () {
        if (shapeMode === 'circle') {
            deactivateShape();
        } else {
            activateShape('circle');
        }
    });

    btnShapeConfirm.addEventListener('click', confirmShape);

    // Handle map clicks during draw mode
    function onMapClick(e) {
        if (!isDrawing || shapeMode) return;
        addDrawPoint(e.latlng);
    }

    // Color option selection
    colorOptions.forEach(function (opt) {
        opt.addEventListener('click', function () {
            colorOptions.forEach(function (o) { o.classList.remove('selected'); });
            opt.classList.add('selected');
            selectedColor = opt.getAttribute('data-color');
        });
    });

    // Event listeners
    btnLocate.addEventListener('click', locateMe);
    btnTrack.addEventListener('click', toggleTracking);
    btnZoomIn.addEventListener('click', function () {
        map.zoomIn();
    });
    btnZoomOut.addEventListener('click', function () {
        map.zoomOut();
    });
    btnCloseInfo.addEventListener('click', function () {
        infoPanel.classList.add('hidden');
    });

    btnDraw.addEventListener('click', function () {
        if (isDrawing) {
            stopDrawMode();
        } else {
            startDrawMode();
        }
    });

    btnBuildings.addEventListener('click', function () {
        if (buildingListPanel.classList.contains('hidden')) {
            buildingListPanel.classList.remove('hidden');
            infoPanel.classList.add('hidden');
        } else {
            buildingListPanel.classList.add('hidden');
        }
    });

    btnCloseBuildingList.addEventListener('click', function () {
        buildingListPanel.classList.add('hidden');
    });

    // ---- Import / Export ----

    var btnExport = document.getElementById('btn-export-buildings');
    var btnImport = document.getElementById('btn-import-buildings');
    var importFileInput = document.getElementById('import-file-input');

    var CapFilesystem = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Filesystem;
    var CapShare = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Share;

    function getBuildingsData() {
        return buildings.map(function (b) {
            return { id: b.id, name: b.name, desc: b.desc, color: b.color, points: b.points };
        });
    }

    function exportBuildings() {
        if (buildings.length === 0) {
            showToast('내보낼 건물이 없습니다.');
            return;
        }
        var jsonStr = JSON.stringify(getBuildingsData(), null, 2);
        var fileName = 'buildings_' + new Date().toISOString().slice(0, 10) + '.json';

        if (CapFilesystem && CapShare) {
            // Write to cache, then share
            CapFilesystem.writeFile({
                path: fileName,
                data: jsonStr,
                directory: 'CACHE',
                encoding: 'utf8',
            }).then(function () {
                return CapFilesystem.getUri({ path: fileName, directory: 'CACHE' });
            }).then(function (result) {
                return CapShare.share({
                    title: '건물 데이터',
                    files: [result.uri],
                });
            }).catch(function (err) {
                // User cancelled share is not an error
                if (err && err.message && err.message.indexOf('cancel') < 0) {
                    showToast('내보내기 실패: ' + err.message);
                }
            });
        } else {
            // Web fallback
            var blob = new Blob([jsonStr], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    }

    function importFromJson(jsonStr) {
        try {
            var data = JSON.parse(jsonStr);
            if (!Array.isArray(data)) {
                showToast('올바른 건물 데이터 파일이 아닙니다.');
                return;
            }
            var count = 0;
            var skipped = 0;
            data.forEach(function (b) {
                if (!b.points || b.points.length < 3 || !b.name) return;
                // Skip if same name and same first point already exists
                var duplicate = buildings.some(function (ex) {
                    if (ex.name !== b.name) return false;
                    if (ex.points.length !== b.points.length) return false;
                    return ex.points[0][0] === b.points[0][0] && ex.points[0][1] === b.points[0][1];
                });
                if (duplicate) { skipped++; return; }
                var building = {
                    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                    name: b.name,
                    desc: b.desc || '',
                    color: b.color || '#2563eb',
                    points: b.points,
                };
                buildings.push(building);
                addBuildingToMap(building);
                count++;
            });
            if (count > 0) {
                saveBuildingsToStorage();
                renderBuildingList();
                var msg = count + '개 건물을 가져왔습니다.';
                if (skipped > 0) msg += ' (중복 ' + skipped + '개 제외)';
                showToast(msg);
            } else if (skipped > 0) {
                showToast('모두 이미 등록된 건물입니다. (' + skipped + '개)');
            } else {
                showToast('가져올 수 있는 건물이 없습니다.');
            }
        } catch (err) {
            showToast('파일을 읽을 수 없습니다.');
        }
    }

    function importBuildings() {
        // Use hidden file input — works in Capacitor WebView
        importFileInput.value = '';
        importFileInput.click();
    }

    btnExport.addEventListener('click', exportBuildings);
    btnImport.addEventListener('click', importBuildings);
    importFileInput.addEventListener('change', function () {
        var file = importFileInput.files && importFileInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (e) {
            importFromJson(e.target.result);
        };
        reader.onerror = function () {
            showToast('파일을 읽을 수 없습니다.');
        };
        reader.readAsText(file);
    });

    btnUndoPoint.addEventListener('click', undoLastPoint);
    btnFinishDraw.addEventListener('click', finishDraw);
    btnCancelDraw.addEventListener('click', stopDrawMode);
    dialogCancel.addEventListener('click', function () {
        buildingDialog.classList.add('hidden');
    });
    dialogSave.addEventListener('click', saveBuilding);

    buildingNameInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); saveBuilding(); }
    });

    // Initialize
    initMap();
    map.on('click', onMapClick);

    // Prevent click propagation from UI overlays to the map
    [document.getElementById('controls'), drawPanel, drawHint, buildingListPanel, buildingDialog, shapeOverlay].forEach(function (el) {
        if (el) L.DomEvent.disableClickPropagation(el);
    });

    loadBuildingsFromStorage();
})();
