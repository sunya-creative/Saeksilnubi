// app.js - 색실누비 도안 생성기 통합 스크립트 (CORS 이슈 없이 로컬 더블 클릭으로 실행 가능)

// ==========================================
// 1. SDF 및 Marching Squares 오프셋 알고리즘
// ==========================================

// 점 P에서 선분 AB까지의 제곱 거리 계산
function pointToSegmentDistSq(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return (px - x1) * (px - x1) + (py - y1) * (py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return (px - projX) * (px - projX) + (py - projY) * (py - projY);
}

// 2D Distance Field 생성 클래스
class DistanceField {
    constructor(width, height, segments, gridSize = 300) {
        this.width = width;
        this.height = height;
        this.segments = segments;

        const aspect = width / height;
        if (aspect >= 1) {
            this.gridW = gridSize;
            this.gridH = Math.round(gridSize / aspect);
        } else {
            this.gridH = gridSize;
            this.gridW = Math.round(gridSize * aspect);
        }

        this.cellW = width / this.gridW;
        this.cellH = height / this.gridH;
        this.grid = [];
        this.maxDistance = Math.sqrt(width * width + height * height);
    }

    calculate() {
        this.grid = Array(this.gridW + 1).fill().map(() => new Float32Array(this.gridH + 1));

        if (this.segments.length === 0) {
            for (let x = 0; x <= this.gridW; x++) {
                for (let y = 0; y <= this.gridH; y++) {
                    this.grid[x][y] = this.maxDistance;
                }
            }
            return;
        }

        const segCount = this.segments.length;

        for (let i = 0; i <= this.gridW; i++) {
            const px = i * this.cellW;
            for (let j = 0; j <= this.gridH; j++) {
                const py = j * this.cellH;
                
                let minSqDist = Infinity;
                for (let s = 0; s < segCount; s++) {
                    const seg = this.segments[s];
                    const distSq = pointToSegmentDistSq(px, py, seg.x1, seg.y1, seg.x2, seg.y2);
                    if (distSq < minSqDist) {
                        minSqDist = distSq;
                    }
                }
                
                this.grid[i][j] = Math.sqrt(minSqDist);
            }
        }
    }

    extractIsoline(threshold) {
        const isolineSegments = [];

        for (let x = 0; x < this.gridW; x++) {
            for (let y = 0; y < this.gridH; y++) {
                const x0 = x * this.cellW;
                const x1 = (x + 1) * this.cellW;
                const y0 = y * this.cellH;
                const y1 = (y + 1) * this.cellH;

                const v0 = this.grid[x][y];
                const v1 = this.grid[x + 1][y];
                const v2 = this.grid[x + 1][y + 1];
                const v3 = this.grid[x][y + 1];

                const c0 = v0 < threshold ? 1 : 0;
                const c1 = v1 < threshold ? 1 : 0;
                const c2 = v2 < threshold ? 1 : 0;
                const c3 = v3 < threshold ? 1 : 0;

                const caseIndex = (c0 << 0) | (c1 << 1) | (c2 << 2) | (c3 << 3);

                if (caseIndex === 0 || caseIndex === 15) continue;

                const lerpX = (val0, val1, xa, xb) => {
                    if (Math.abs(val1 - val0) < 1e-5) return (xa + xb) / 2;
                    return xa + ((threshold - val0) / (val1 - val0)) * (xb - xa);
                };

                const lerpY = (val0, val1, ya, yb) => {
                    if (Math.abs(val1 - val0) < 1e-5) return (ya + yb) / 2;
                    return ya + ((threshold - val0) / (val1 - val0)) * (yb - ya);
                };

                const pEdge0 = () => ({ x: lerpX(v0, v1, x0, x1), y: y0 });
                const pEdge1 = () => ({ x: x1, y: lerpY(v1, v2, y0, y1) });
                const pEdge2 = () => ({ x: lerpX(v3, v2, x0, x1), y: y1 });
                const pEdge3 = () => ({ x: x0, y: lerpY(v0, v3, y0, y1) });

                switch (caseIndex) {
                    case 1:
                    case 14:
                        isolineSegments.push({ p1: pEdge0(), p2: pEdge3() });
                        break;
                    case 2:
                    case 13:
                        isolineSegments.push({ p1: pEdge0(), p2: pEdge1() });
                        break;
                    case 3:
                    case 12:
                        isolineSegments.push({ p1: pEdge1(), p2: pEdge3() });
                        break;
                    case 4:
                    case 11:
                        isolineSegments.push({ p1: pEdge1(), p2: pEdge2() });
                        break;
                    case 5:
                        isolineSegments.push({ p1: pEdge0(), p2: pEdge1() });
                        isolineSegments.push({ p1: pEdge2(), p2: pEdge3() });
                        break;
                    case 6:
                    case 9:
                        isolineSegments.push({ p1: pEdge0(), p2: pEdge2() });
                        break;
                    case 7:
                    case 8:
                        isolineSegments.push({ p1: pEdge2(), p2: pEdge3() });
                        break;
                    case 10:
                        isolineSegments.push({ p1: pEdge0(), p2: pEdge3() });
                        isolineSegments.push({ p1: pEdge1(), p2: pEdge2() });
                        break;
                }
            }
        }

        return this.chainSegments(isolineSegments);
    }

    chainSegments(segments) {
        if (segments.length === 0) return [];

        const paths = [];
        const eps = 0.5;
        const epsSq = eps * eps;
        let remaining = [...segments];

        while (remaining.length > 0) {
            const startSeg = remaining.shift();
            const path = [startSeg.p1, startSeg.p2];

            let added = true;
            while (added) {
                added = false;
                const tail = path[path.length - 1];
                const head = path[0];

                for (let i = 0; i < remaining.length; i++) {
                    const seg = remaining[i];
                    
                    const distTailP1 = (tail.x - seg.p1.x)**2 + (tail.y - seg.p1.y)**2;
                    if (distTailP1 < epsSq) {
                        path.push(seg.p2);
                        remaining.splice(i, 1);
                        added = true;
                        break;
                    }
                    const distTailP2 = (tail.x - seg.p2.x)**2 + (tail.y - seg.p2.y)**2;
                    if (distTailP2 < epsSq) {
                        path.push(seg.p1);
                        remaining.splice(i, 1);
                        added = true;
                        break;
                    }

                    const distHeadP1 = (head.x - seg.p1.x)**2 + (head.y - seg.p1.y)**2;
                    if (distHeadP1 < epsSq) {
                        path.unshift(seg.p2);
                        remaining.splice(i, 1);
                        added = true;
                        break;
                    }
                    const distHeadP2 = (head.x - seg.p2.x)**2 + (head.y - seg.p2.y)**2;
                    if (distHeadP2 < epsSq) {
                        path.unshift(seg.p1);
                        remaining.splice(i, 1);
                        added = true;
                        break;
                    }
                }
            }

            const first = path[0];
            const last = path[path.length - 1];
            const isClosed = (first.x - last.x)**2 + (first.y - last.y)**2 < epsSq;

            paths.push({
                points: path,
                isClosed: isClosed
            });
        }

        return paths;
    }
}

function generateOffsets(width, height, activeSegments, stepPx, gridSize = 300) {
    if (activeSegments.length === 0) return [];

    const df = new DistanceField(width, height, activeSegments, gridSize);
    df.calculate();

    const maxDist = df.maxDistance;
    const paths = [];

    let distance = stepPx;
    let index = 0;
    while (distance < maxDist) {
        const isolines = df.extractIsoline(distance);
        if (isolines.length === 0) {
            if (distance > maxDist * 0.8) break; 
        }

        isolines.forEach(path => {
            paths.push({
                points: path.points,
                isClosed: path.isClosed,
                distance: distance,
                layerIndex: index,
                color: '#e63946'
            });
        });

        distance += stepPx;
        index++;

        if (index > 150) break;
    }

    return paths;
}

// ==========================================
// 2. 캔버스 및 그리기 영역 핸들러
// ==========================================

class CanvasManager {
    constructor(canvasId, containerId) {
        this.canvas = document.getElementById(canvasId);
        this.container = document.getElementById(containerId);
        this.ctx = this.canvas.getContext('2d');

        this.isDrawing = false;
        this.currentTool = 'line'; // 직선이 기본 도구
        this.strokeWidth = 1.2;
        this.strokeColor = '#9e2a2b';
        this.bgColor = '#fcf6f5'; // 기본 배경색을 #fcf6f5로 변경

        this.widthCm = 16;
        this.heightCm = 10;
        this.pixelScale = 40; // 1cm = 40px

        this.useSymmetry = false; // 방사 대칭 비활성화가 기본
        this.symmetryCount = 6; // 대칭 축 개수 기본값 6
        this.symmetryCenter = { x: 0, y: 0 };

        // 수직/수평 스냅 설정
        this.snapHV = true; // 수직/수평 스냅 활성화가 기본
        this.shiftPressed = false;

        this.strokes = [];
        this.redoStrokes = [];
        this.currentStroke = null;
        this.lastPoint = { x: 0, y: 0 };
        this.startPoint = { x: 0, y: 0 };

        this.offsetPaths = [];
        this.dashLength = 6; // 6px 고정 (길이 6px, 간격 3px)
        this.dashGap = 3;     // 3px 고정
        
        this.zoom = 1.0;
        this.hoverPoint = null; // 그리기 시작 전의 호버 좌표용

        this.initEvents();
        this.resizeCanvas();
    }

    setDimensions(widthCm, heightCm) {
        this.widthCm = widthCm;
        this.heightCm = heightCm;
        this.resizeCanvas();
    }

    resizeCanvas() {
        const targetWidth = this.widthCm * this.pixelScale;
        const targetHeight = this.heightCm * this.pixelScale;

        this.canvas.width = targetWidth;
        this.canvas.height = targetHeight;

        this.updateCanvasCSS();
        this.render();
    }

    updateCanvasCSS() {
        const baseWidth = this.widthCm * this.pixelScale;
        const baseHeight = this.heightCm * this.pixelScale;
        this.canvas.style.width = `${baseWidth * this.zoom}px`;
        this.canvas.style.height = `${baseHeight * this.zoom}px`;
    }

    setZoom(zoomFactor) {
        this.zoom = Math.max(0.2, Math.min(3.0, zoomFactor));
        this.updateCanvasCSS();
    }

    setBackgroundColor(color) {
        this.bgColor = color;
        this.render();
    }

    setTool(tool) {
        this.currentTool = tool;
    }

    setSymmetry(enable, count) {
        this.useSymmetry = enable;
        if (count !== undefined) this.symmetryCount = count;
    }

    getCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        let clientX, clientY;

        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const x = ((clientX - rect.left) / rect.width) * this.canvas.width;
        const y = ((clientY - rect.top) / rect.height) * this.canvas.height;

        return { x, y };
    }

    initEvents() {
        this.canvas.addEventListener('mousedown', (e) => this.handleStart(e));
        
        window.addEventListener('mousemove', (e) => {
            this.handleMove(e);
            if (!this.isDrawing) {
                const rect = this.canvas.getBoundingClientRect();
                if (e.clientX >= rect.left && e.clientX <= rect.right &&
                    e.clientY >= rect.top && e.clientY <= rect.bottom) {
                    let coords = this.getCoordinates(e);

                    // 그리기 전 호버 상태에서도 스냅이 켜져 있고 직선 도구이면 0.5cm(20px) 격자 스냅 적용
                    if (this.snapHV && this.currentTool === 'line') {
                        coords.x = Math.round(coords.x / 20) * 20;
                        coords.y = Math.round(coords.y / 20) * 20;
                    }

                    this.hoverPoint = coords;
                    this.render();
                } else {
                    if (this.hoverPoint) {
                        this.hoverPoint = null;
                        this.render();
                    }
                }
            }
        });

        window.addEventListener('mouseup', () => this.handleEnd());

        this.canvas.addEventListener('mouseleave', () => {
            if (this.hoverPoint) {
                this.hoverPoint = null;
                this.render();
            }
        });

        // 터치 이벤트
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleStart(e);
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.handleMove(e);
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.handleEnd();
        }, { passive: false });

        // Shift 키 및 Cmd+Z / Ctrl+Z 실행취소 단축키 감지
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Shift') {
                this.shiftPressed = true;
            }
            
            const isCmdOrCtrl = e.metaKey || e.ctrlKey;
            if (isCmdOrCtrl && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    this.redo();
                } else {
                    this.undo();
                }
            } else if (isCmdOrCtrl && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                this.redo();
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.key === 'Shift') {
                this.shiftPressed = false;
            }
        });
    }

    // 수평/수직 및 길이 격자 스냅 변환 함수 (각도는 45도 단위, 길이는 대지 5mm(20px) 단위 격자 스냅)
    snapToHV(start, current) {
        let dx = current.x - start.x;
        let dy = current.y - start.y;
        let len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return current;

        // 1. 각도 스냅 (45도 단위)
        const angle = Math.atan2(dy, dx);
        const angleStep = Math.PI / 4;
        const snappedAngle = Math.round(angle / angleStep) * angleStep;

        // 2. 대지 5mm 격자 스냅 (5mm = 20px)
        const gridUnit = 20; 
        const snappedLen = Math.round(len / gridUnit) * gridUnit;

        return {
            x: start.x + snappedLen * Math.cos(snappedAngle),
            y: start.y + snappedLen * Math.sin(snappedAngle)
        };
    }

    handleStart(e) {
        let coords = this.getCoordinates(e);

        // 스냅 설정 시 직선 툴은 시작점을 대지 5mm 격자에 스냅
        if ((this.snapHV || this.shiftPressed) && this.currentTool === 'line') {
            coords.x = Math.round(coords.x / 20) * 20;
            coords.y = Math.round(coords.y / 20) * 20;
        }

        this.isDrawing = true;
        this.lastPoint = coords;
        this.startPoint = coords;

        if (this.useSymmetry) {
            this.symmetryCenter = coords;
        }

        this.currentStroke = {
            id: Date.now(),
            tool: this.currentTool,
            color: this.currentTool === 'eraser' ? 'eraser' : this.strokeColor,
            width: this.currentTool === 'eraser' ? 20 : this.strokeWidth,
            segments: []
        };
    }

    handleMove(e) {
        if (!this.isDrawing || !this.currentStroke) return;

        let coords = this.getCoordinates(e);
        
        // 스냅 설정 혹은 Shift 키 입력 시 좌표 보정 (직선 툴일 때만 5mm 스냅 작동)
        if ((this.snapHV || this.shiftPressed) && this.currentTool === 'line') {
            coords = this.snapToHV(this.startPoint, coords);
        }

        if (this.currentTool === 'pencil' || this.currentTool === 'eraser') {
            this.addSegments(this.lastPoint.x, this.lastPoint.y, coords.x, coords.y);
            this.lastPoint = coords;
            this.render();
        } else if (this.currentTool === 'line') {
            this.lastPoint = coords;
            this.render();
            this.renderTempLine();
        }
    }

    handleEnd() {
        if (!this.isDrawing) return;
        this.isDrawing = false;

        if (this.currentStroke) {
            if (this.currentTool === 'line') {
                this.addSegments(this.startPoint.x, this.startPoint.y, this.lastPoint.x, this.lastPoint.y);
            }
            
            if (this.currentStroke.segments.length > 0) {
                this.strokes.push(this.currentStroke);
                this.redoStrokes = [];
            }
        }
        this.currentStroke = null;
        this.render();
    }

    addSegments(x1, y1, x2, y2) {
        if (!this.currentStroke) return;

        const color = this.currentStroke.color;
        const width = this.currentStroke.width;

        if (this.useSymmetry && color !== 'eraser') {
            const cx = this.symmetryCenter.x;
            const cy = this.symmetryCenter.y;
            const angleStep = (2 * Math.PI) / this.symmetryCount;

            for (let i = 0; i < this.symmetryCount; i++) {
                const angle = i * angleStep;
                const rx1 = cx + (x1 - cx) * Math.cos(angle) - (y1 - cy) * Math.sin(angle);
                const ry1 = cy + (x1 - cx) * Math.sin(angle) + (y1 - cy) * Math.cos(angle);
                const rx2 = cx + (x2 - cx) * Math.cos(angle) - (y2 - cy) * Math.sin(angle);
                const ry2 = cy + (x2 - cx) * Math.sin(angle) + (y2 - cy) * Math.cos(angle);

                this.currentStroke.segments.push({ x1: rx1, y1: ry1, x2: rx2, y2: ry2 });
            }
        } else {
            this.currentStroke.segments.push({ x1, y1, x2: y2 ? x2 : x1, y2: y2 ? y2 : y1 });
        }
    }

    renderTempLine() {
        this.ctx.save();
        this.ctx.strokeStyle = this.strokeColor;
        this.ctx.lineWidth = this.strokeWidth;
        this.ctx.lineCap = 'round';
        this.ctx.setLineDash([this.dashLength, this.dashGap]); // 그리는 도중의 직선도 동일한 2.5mm 점선으로 렌더링

        if (this.useSymmetry) {
            const cx = this.symmetryCenter.x;
            const cy = this.symmetryCenter.y;
            const angleStep = (2 * Math.PI) / this.symmetryCount;

            for (let i = 0; i < this.symmetryCount; i++) {
                const angle = i * angleStep;
                const rx1 = cx + (this.startPoint.x - cx) * Math.cos(angle) - (this.startPoint.y - cy) * Math.sin(angle);
                const ry1 = cy + (this.startPoint.x - cx) * Math.sin(angle) + (this.startPoint.y - cy) * Math.cos(angle);
                const rx2 = cx + (this.lastPoint.x - cx) * Math.cos(angle) - (this.lastPoint.y - cy) * Math.sin(angle);
                const ry2 = cy + (this.lastPoint.x - cx) * Math.sin(angle) + (this.lastPoint.y - cy) * Math.cos(angle);

                this.ctx.beginPath();
                this.ctx.moveTo(rx1, ry1);
                this.ctx.lineTo(rx2, ry2);
                this.ctx.stroke();
            }
        } else {
            this.ctx.beginPath();
            this.ctx.moveTo(this.startPoint.x, this.startPoint.y);
            this.ctx.lineTo(this.lastPoint.x, this.lastPoint.y);
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    renderDimension(start, end) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const lenPx = Math.sqrt(dx * dx + dy * dy);
        const lenCm = (lenPx / 40).toFixed(1); // 1cm = 40px

        if (lenPx < 5) return;

        this.ctx.save();
        
        this.ctx.font = '500 12px "Outfit", "Noto Sans KR", sans-serif';
        const text = `${lenCm} cm`;
        const textWidth = this.ctx.measureText(text).width;
        
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;

        // 대지 경계 바깥으로 텍스트 배지가 삐져나가 잘리지 않도록 Clamp 좌표 보정
        const padX = textWidth / 2 + 8;
        const padY = 22;
        const badgeX = Math.max(padX, Math.min(this.canvas.width - padX, midX));
        const badgeY = Math.max(padY, Math.min(this.canvas.height - 10, midY));

        // 1. 치수선
        this.ctx.strokeStyle = 'rgba(195, 0, 16, 0.45)';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([2, 2]);
        this.ctx.beginPath();
        this.ctx.moveTo(start.x, start.y);
        this.ctx.lineTo(end.x, end.y);
        this.ctx.stroke();

        // 2. 수치 배경 배지
        this.ctx.fillStyle = 'rgba(61, 58, 52, 0.85)';
        this.ctx.fillRect(badgeX - textWidth/2 - 6, badgeY - 20, textWidth + 12, 18);

        // 3. 수치 텍스트 그리기
        this.ctx.fillStyle = '#ffffff';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, badgeX, badgeY - 11);

        this.ctx.restore();
    }

    renderGrid() {
        this.ctx.save();
        // 5mm 격자망을 아주 옅은 웜그레이 톤으로 연출
        this.ctx.strokeStyle = 'rgba(61, 58, 52, 0.05)'; 
        this.ctx.lineWidth = 0.5;

        const gridUnit = 20; // 5mm = 20px
        
        // 수직 보조선
        for (let x = gridUnit; x < this.canvas.width; x += gridUnit) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }

        // 수평 보조선
        for (let y = gridUnit; y < this.canvas.height; y += gridUnit) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    renderCenterMark() {
        this.ctx.save();
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;

        // 포인트 연보라색(#c3bfd8)에 은은한 반투명도를 가미한 중심선 마크
        this.ctx.strokeStyle = 'rgba(195, 191, 216, 0.75)'; 
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([]); // 실선 조준선

        const size = 16; // 십자가 반경

        // 십자선 (+)
        this.ctx.beginPath();
        this.ctx.moveTo(cx - size, cy);
        this.ctx.lineTo(cx + size, cy);
        this.ctx.moveTo(cx, cy - size);
        this.ctx.lineTo(cx, cy + size);
        this.ctx.stroke();

        // 중앙 보조용 미세 원형
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
        this.ctx.stroke();

        this.ctx.restore();
    }

    // 선분 위에 투영된 점 중 마우스 좌표와 가장 가까운 발의 위치 계산
    getClosestPointOnSegment(P, A, B) {
        const l2 = (A.x - B.x)**2 + (A.y - B.y)**2;
        if (l2 === 0) return A;
        let t = ((P.x - A.x) * (B.x - A.x) + (P.y - A.y) * (B.y - A.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return {
            x: A.x + t * (B.x - A.x),
            y: A.y + t * (B.y - A.y)
        };
    }

    // 마우스 호버 시 이미 그려진 가로/세로 선들과의 최단 수평/수직 거리를 동시에 시각화
    renderHoverDistanceGuide() {
        if (!this.hoverPoint || this.isDrawing || this.strokes.length === 0) return;

        const P = this.hoverPoint;
        
        let minDHoriz = Infinity;
        let closestPtHoriz = null;
        
        let minDVert = Infinity;
        let closestPtVert = null;

        this.strokes.forEach(stroke => {
            if (stroke.color === 'eraser') return; // 지우개선 제외
            stroke.segments.forEach(seg => {
                const A = { x: seg.x1, y: seg.y1 };
                const B = { x: seg.x2, y: seg.y2 };
                const dist = Math.sqrt(this.pointToSegmentDistance(P, A, B));
                const proj = this.getClosestPointOnSegment(P, A, B);

                // 가로선분과 세로선분 분류 (dx > dy 이면 가로선, 반대면 세로선)
                const dx = Math.abs(B.x - A.x);
                const dy = Math.abs(B.y - A.y);
                
                if (dx > dy) {
                    if (dist < minDHoriz) {
                        minDHoriz = dist;
                        closestPtHoriz = proj;
                    }
                } else {
                    if (dist < minDVert) {
                        minDVert = dist;
                        closestPtVert = proj;
                    }
                }
            });
        });

        const drawIndicator = (closestPt, minD, isHorizLine) => {
            if (closestPt && minD > 3 && minD < 200) {
                const lenCm = (minD / 40).toFixed(1);

                this.ctx.save();
                
                // 1. 간격 지시선 (연보라색 보조 점선)
                this.ctx.strokeStyle = 'rgba(195, 191, 216, 0.95)';
                this.ctx.lineWidth = 1;
                this.ctx.setLineDash([2, 2]);
                this.ctx.beginPath();
                this.ctx.moveTo(P.x, P.y);
                this.ctx.lineTo(closestPt.x, closestPt.y);
                this.ctx.stroke();

                // 2. 가이드 앵커용 미세 서클
                this.ctx.fillStyle = '#c3bfd8';
                this.ctx.beginPath();
                this.ctx.arc(closestPt.x, closestPt.y, 2.5, 0, 2 * Math.PI);
                this.ctx.arc(P.x, P.y, 2.5, 0, 2 * Math.PI);
                this.ctx.fill();

                // 3. 간격 수치 텍스트 배지 그리기
                this.ctx.font = '500 11px "Outfit", sans-serif';
                const text = `${lenCm} cm`;
                const textWidth = this.ctx.measureText(text).width;
                
                const midX = (P.x + closestPt.x) / 2;
                const midY = (P.y + closestPt.y) / 2;

                // 대지 경계 바깥으로 텍스트 배지가 삐져나가 잘리지 않도록 Clamp 좌표 보정
                const padX = textWidth / 2 + 8;
                const padY = 20; 
                let badgeX = Math.max(padX, Math.min(this.canvas.width - padX, midX));
                let badgeY = Math.max(padY, Math.min(this.canvas.height - 10, midY));

                // 가로선과 세로선 배지가 겹칠 때 약간 분리 배치 오프셋 부여
                if (!isHorizLine) {
                    badgeY = Math.max(padY, Math.min(this.canvas.height - 10, badgeY - 12));
                }

                // 배지 배경
                this.ctx.fillStyle = 'rgba(61, 58, 52, 0.85)'; // 차콜 세련된 배경
                this.ctx.fillRect(badgeX - textWidth/2 - 6, badgeY - 18, textWidth + 12, 16);

                // 텍스트
                this.ctx.fillStyle = '#ffffff';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(text, badgeX, badgeY - 9);

                this.ctx.restore();
            }
        };

        // 가로/세로 각각의 최단선으로 독립 지시선 드로잉
        drawIndicator(closestPtHoriz, minDHoriz, true);
        drawIndicator(closestPtVert, minDVert, false);
    }

    // 마우스 호버 시 중심점으로부터의 가로·세로 간격 표시
    renderCursorCenterDistance() {
        if (!this.hoverPoint || this.isDrawing) return;

        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        const P = this.hoverPoint;

        const dx = P.x - cx; // 가로 거리 (픽셀)
        const dy = P.y - cy; // 세로 거리 (픽셀)

        const dxCm = (Math.abs(dx) / 40).toFixed(1);
        const dyCm = (Math.abs(dy) / 40).toFixed(1);

        this.ctx.save();

        // 중심에서 커서까지 점선 가이드 (가로)
        this.ctx.strokeStyle = 'rgba(195, 191, 216, 0.5)';
        this.ctx.lineWidth = 0.8;
        this.ctx.setLineDash([3, 3]);

        // 가로 점선 (center.y → cursor까지 수평)
        this.ctx.beginPath();
        this.ctx.moveTo(cx, P.y);
        this.ctx.lineTo(P.x, P.y);
        this.ctx.stroke();

        // 세로 점선 (center.x → cursor까지 수직)
        this.ctx.beginPath();
        this.ctx.moveTo(P.x, cy);
        this.ctx.lineTo(P.x, P.y);
        this.ctx.stroke();

        // 텍스트 배지
        this.ctx.setLineDash([]);
        this.ctx.font = '500 10px "Outfit", sans-serif';
        this.ctx.textBaseline = 'middle';

        const text = `X ${dxCm}  Y ${dyCm}`;
        const textWidth = this.ctx.measureText(text).width;

        // 커서 우하단에 배지 표시
        let badgeX = P.x + 14;
        let badgeY = P.y + 14;

        // 캔버스 경계 보정
        if (badgeX + textWidth + 12 > this.canvas.width) badgeX = P.x - textWidth - 20;
        if (badgeY + 10 > this.canvas.height) badgeY = P.y - 22;

        // 배지 배경
        this.ctx.fillStyle = 'rgba(61, 58, 52, 0.7)';
        const rr = 3;
        const bw = textWidth + 10;
        const bh = 16;
        const bx = badgeX - 5;
        const by = badgeY - 8;
        this.ctx.beginPath();
        this.ctx.moveTo(bx + rr, by);
        this.ctx.lineTo(bx + bw - rr, by);
        this.ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + rr);
        this.ctx.lineTo(bx + bw, by + bh - rr);
        this.ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - rr, by + bh);
        this.ctx.lineTo(bx + rr, by + bh);
        this.ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - rr);
        this.ctx.lineTo(bx, by + rr);
        this.ctx.quadraticCurveTo(bx, by, bx + rr, by);
        this.ctx.closePath();
        this.ctx.fill();

        // 텍스트
        this.ctx.fillStyle = '#ffffff';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(text, badgeX, badgeY);

        this.ctx.restore();
    }

    render() {
        this.ctx.fillStyle = this.bgColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 1. 대지에 5mm 그리드 가이드망 렌더링
        this.renderGrid();

        // 1.5. 대지 정중앙 중심 마크 렌더링
        this.renderCenterMark();

        // 2. 사용자가 그린 스케치 그리기 (제일 뒤로)
        this.renderStrokes();

        // 3. 오프셋 라인 그리기 (그 위에 덮어 그림)
        this.renderOffsetPaths();

        // 3.5. 그리기 시작 전, 마우스 밑 가장 가까운 선까지의 간격 표시
        this.renderHoverDistanceGuide();

        // 3.6. 커서의 중심점 대비 가로·세로 간격 표시
        this.renderCursorCenterDistance();

        // 4. 드로잉 중일 때 가이드선과 치수 텍스트 표시
        if (this.isDrawing && this.currentTool !== 'eraser') {
            this.renderDimension(this.startPoint, this.lastPoint);
            
            if (this.useSymmetry) {
                this.renderSymmetryGuide();
            }
        }
    }

    renderStrokes() {
        this.ctx.save();
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        this.strokes.forEach(stroke => {
            if (stroke.color === 'eraser') {
                this.ctx.strokeStyle = this.bgColor;
                this.ctx.lineWidth = stroke.width;
                this.ctx.setLineDash([]); // 지우개는 실선
            } else {
                this.ctx.strokeStyle = stroke.color;
                this.ctx.lineWidth = stroke.width;
                this.ctx.setLineDash([this.dashLength, this.dashGap]); // 일반 스케치선은 동일한 2.5mm 점선
            }

            this.ctx.beginPath();
            stroke.segments.forEach(seg => {
                this.ctx.moveTo(seg.x1, seg.y1);
                this.ctx.lineTo(seg.x2, seg.y2);
            });
            this.ctx.stroke();
        });

        if (this.isDrawing && this.currentStroke && (this.currentTool === 'pencil' || this.currentTool === 'eraser')) {
            if (this.currentStroke.color === 'eraser') {
                this.ctx.strokeStyle = this.bgColor;
                this.ctx.lineWidth = this.currentStroke.width;
                this.ctx.setLineDash([]); // 지우개는 실선
            } else {
                this.ctx.strokeStyle = this.currentStroke.color;
                this.ctx.lineWidth = this.currentStroke.width;
                this.ctx.setLineDash([this.dashLength, this.dashGap]); // 그리는 중인 스케치선도 2.5mm 점선
            }

            this.ctx.beginPath();
            this.currentStroke.segments.forEach(seg => {
                this.ctx.moveTo(seg.x1, seg.y1);
                this.ctx.lineTo(seg.x2, seg.y2);
            });
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    renderOffsetPaths() {
        if (!this.offsetPaths || this.offsetPaths.length === 0) return;

        this.ctx.save();
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.setLineDash([this.dashLength, this.dashGap]);

        this.offsetPaths.forEach(path => {
            this.ctx.strokeStyle = path.color || '#e63946';
            this.ctx.lineWidth = 1.2;

            this.ctx.beginPath();
            if (path.points && path.points.length > 0) {
                this.ctx.moveTo(path.points[0].x, path.points[0].y);
                for (let i = 1; i < path.points.length; i++) {
                    this.ctx.lineTo(path.points[i].x, path.points[i].y);
                }
                if (path.isClosed) {
                    this.ctx.closePath();
                }
                this.ctx.stroke();
            }
        });

        this.ctx.restore();
    }

    renderSymmetryGuide() {
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(158, 42, 43, 0.3)';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);

        const cx = this.symmetryCenter.x;
        const cy = this.symmetryCenter.y;
        const radius = Math.max(this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = 'rgba(158, 42, 43, 0.5)';
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 5, 0, 2 * Math.PI);
        this.ctx.fill();

        const angleStep = (2 * Math.PI) / this.symmetryCount;
        for (let i = 0; i < this.symmetryCount; i++) {
            const angle = i * angleStep;
            const ex = cx + radius * Math.cos(angle);
            const ey = cy + radius * Math.sin(angle);

            this.ctx.beginPath();
            this.ctx.moveTo(cx, cy);
            this.ctx.lineTo(ex, ey);
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    getActiveSegments() {
        let activeSegs = [];
        const erasers = this.strokes.filter(s => s.color === 'eraser');

        this.strokes.filter(s => s.color !== 'eraser').forEach(stroke => {
            stroke.segments.forEach(seg => {
                let isErased = false;
                for (const eraser of erasers) {
                    for (const eseg of eraser.segments) {
                        if (this.getMinDistanceBetweenSegments(seg, eseg) < eraser.width / 2) {
                            isErased = true;
                            break;
                        }
                    }
                    if (isErased) break;
                }

                if (!isErased) {
                    activeSegs.push(seg);
                }
            });
        });

        return activeSegs;
    }

    getMinDistanceBetweenSegments(seg1, seg2) {
        const A = { x: seg1.x1, y: seg1.y1 };
        const B = { x: seg1.x2, y: seg1.y2 };
        const C = { x: seg2.x1, y: seg2.y1 };
        const D = { x: seg2.x2, y: seg2.y2 };

        const distSq = (p1, p2) => (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
        
        return Math.sqrt(Math.min(
            this.pointToSegmentDistance(A, C, D),
            this.pointToSegmentDistance(B, C, D),
            this.pointToSegmentDistance(C, A, B),
            this.pointToSegmentDistance(D, A, B)
        ));
    }

    pointToSegmentDistance(P, A, B) {
        const l2 = (A.x - B.x)**2 + (A.y - B.y)**2;
        if (l2 === 0) return (P.x - A.x)**2 + (P.y - A.y)**2;
        let t = ((P.x - A.x) * (B.x - A.x) + (P.y - A.y) * (B.y - A.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return (P.x - (A.x + t * (B.x - A.x)))**2 + (P.y - (A.y + t * (B.y - A.y)))**2;
    }

    undo() {
        if (this.strokes.length > 0) {
            const popped = this.strokes.pop();
            this.redoStrokes.push(popped);
            this.render();
            return true;
        }
        return false;
    }

    redo() {
        if (this.redoStrokes.length > 0) {
            const popped = this.redoStrokes.pop();
            this.strokes.push(popped);
            this.render();
            return true;
        }
        return false;
    }

    clear() {
        this.strokes = [];
        this.redoStrokes = [];
        this.offsetPaths = [];
        this.render();
    }
}

// ==========================================
// 3. UI 및 애플리케이션 초기화
// ==========================================

const TRADITIONAL_PALETTE = [
    '#9e2a2b', // 주홍 (Red)
    '#3a5a40', // 비취 (Jade Green)
    '#2f4858', // 쪽빛 (Indigo Blue)
    '#d4a373', // 황토 (Warm Ochre)
    '#606c38', // 대나무 (Olive)
    '#b5179e', // 자줏빛 (Plum)
    '#e76f51', // 단청 주홍 (Terracotta)
    '#2a9d8f', // 단청 청록 (Teal)
    '#e9c46a', // 황남 (Mustard Yellow)
    '#a2d2ff', // 연한 하늘 (Soft Blue)
    '#ffafcc', // 진달래 (Soft Pink)
    '#8338ec', // 보랏빛 (Lavender)
];

document.addEventListener('DOMContentLoaded', () => {
    const manager = new CanvasManager('drawing-canvas', 'canvas-container');

    const canvasWidthInput = document.getElementById('canvas-width');
    const canvasHeightInput = document.getElementById('canvas-height');
    const fabricColorCard = document.getElementById('fabric-color-card');

    // 커스텀 컬러 피커 DOM 바인딩 및 변수 선언
    const customColorPicker = document.getElementById('custom-color-picker');
    const pickerPresets = document.getElementById('picker-presets');
    const pickerHue = document.getElementById('picker-hue');
    const pickerLightness = document.getElementById('picker-lightness');
    const pickerPreview = document.getElementById('picker-preview');
    const pickerApplyBtn = document.getElementById('picker-apply-btn');

    let activePickerTarget = null;
    let activePickerCallback = null;
    let activePickerColor = '#9e2a2b';
    let activePickerInitialColor = '#9e2a2b';

    const PALETTE_PRESETS = [
        '#fcf6f5', // 원단색 기본
        '#9e2a2b', // 주홍 (전통 버건디)
        '#3a5a40', // 비취
        '#2f4858', // 쪽빛
        '#d4a373', // 황토
        '#3d3a34', // 먹색
        '#c3bfd8', // 연보라
        '#e76f51', // 단청 주홍
        '#2a9d8f', // 단청 청록
        '#ffafcc'  // 진달래
    ];

    // HEX -> HSL 계산기
    function hexToHsl(hex) {
        let r = parseInt(hex.substring(1, 3), 16) / 255;
        let g = parseInt(hex.substring(3, 5), 16) / 255;
        let b = parseInt(hex.substring(5, 7), 16) / 255;
        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) {
            h = s = 0;
        } else {
            let d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
    }

    // HSL -> HEX 계산기 (채도는 고밀도 누비 땀을 위해 선명도 85% 고정으로 통일하여 최적화)
    function hslToHex(h, s, l) {
        l /= 100;
        const a = (85 * Math.min(l, 1 - l)) / 100;
        const f = n => {
            const k = (n + h / 30) % 12;
            const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * color).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    }

    // rgb(r, g, b) 문자열을 #hex로 변환하는 헬퍼
    function rgbToHex(rgb) {
        const match = rgb.match(/\d+/g);
        if (!match || match.length < 3) return rgb;
        const r = parseInt(match[0]).toString(16).padStart(2, '0');
        const g = parseInt(match[1]).toString(16).padStart(2, '0');
        const b = parseInt(match[2]).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }

    // 밝은 색상인지 판별하는 헬퍼
    function isLightColor(color) {
        if (!color) return false;
        let hex = color.startsWith('rgb') ? rgbToHex(color) : color;
        hex = hex.replace('#', '');
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }
        if (hex.length !== 6) return false;
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const yiq = (r * 299 + g * 587 + b * 114) / 1000;
        return yiq >= 165;
    }

    // 카드 스타일 (배경색 및 텍스트 밝기 대비 보정) 업데이트 헬퍼
    function updateCardStyle(card, color) {
        card.style.backgroundColor = color;
        
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const yiq = (r * 299 + g * 587 + b * 114) / 1000;
        
        // 밝으면 어두운 글씨(#3d3a34), 어두우면 밝은 글씨(#ffffff)
        const textColor = yiq >= 165 ? '#3d3a34' : '#ffffff';
        card.style.color = textColor;
        
        const textElements = card.querySelectorAll('span, p, div');
        textElements.forEach(el => {
            el.style.color = textColor;
            
            // '변경' 문안의 경우 테두리 없이 간결한 텍스트로 보정
            if (el.textContent.trim() === '변경') {
                el.style.border = 'none';
                el.style.backgroundColor = 'transparent';
                el.style.borderRadius = '0';
                el.style.padding = '0';
                el.style.fontSize = '0.7rem';
                el.style.fontWeight = '500';
                el.style.opacity = '0.75';
            }
        });
    }

    // 컬러피커 프리셋 빌드
    function buildPresets() {
        pickerPresets.innerHTML = '';
        PALETTE_PRESETS.forEach(color => {
            const chip = document.createElement('div');
            chip.style.width = '100%';
            chip.style.paddingBottom = '50%';
            chip.style.borderRadius = '4px';
            chip.style.border = '1px solid rgba(0,0,0,0.15)';
            chip.style.backgroundColor = color;
            chip.style.cursor = 'pointer';
            chip.style.transition = 'transform 0.1s';
            
            chip.addEventListener('click', () => {
                updatePickerColor(color);
            });
            pickerPresets.appendChild(chip);
        });
    }

    // 컬러피커 팝업 열기 (화면 밖으로 나가지 않도록 뷰포트 바운더리 체크 연동)
    function openCustomColorPicker(anchorElement, initialColor, callback) {
        activePickerTarget = anchorElement;
        activePickerCallback = callback;
        activePickerInitialColor = initialColor; // 롤백 대비 초기값 백업
        
        updatePickerColor(initialColor);
        buildPresets();

        // 1. 크기를 계산하기 위해 먼저 요소를 노출
        customColorPicker.style.display = 'flex';

        const rect = anchorElement.getBoundingClientRect();
        const pickerWidth = customColorPicker.offsetWidth || 220;
        const pickerHeight = customColorPicker.offsetHeight || 230;

        // 2. 가로(left) 경계 처리: 화면 우측 밖으로 나가는 현상 방지
        const padding = 16;
        let left = rect.left;
        if (left + pickerWidth > window.innerWidth - padding) {
            left = window.innerWidth - pickerWidth - padding;
        }
        if (left < padding) {
            left = padding;
        }

        // 3. 세로(top) 경계 처리: 화면 아래쪽 밖으로 나갈 때 버튼 위로 올림
        let top = rect.bottom + window.scrollY + 6;
        if (rect.bottom + pickerHeight + 12 > window.innerHeight) {
            top = rect.top + window.scrollY - pickerHeight - 6;
        }

        customColorPicker.style.left = `${left}px`;
        customColorPicker.style.top = `${top}px`;
    }

    // 컬러피커 밸류 동기화
    function updatePickerColor(color) {
        activePickerColor = color;
        pickerPreview.style.backgroundColor = color;
        
        const hsl = hexToHsl(color);
        pickerHue.value = hsl.h;
        pickerLightness.value = hsl.l;

        // 가운데 창(캔버스)에 실시간 색상 피드백 반영!
        if (activePickerCallback) {
            activePickerCallback(color);
        }
    }

    // 슬라이더 조절 핸들러
    const onSliderChange = () => {
        const h = parseInt(pickerHue.value);
        const l = parseInt(pickerLightness.value);
        const color = hslToHex(h, 85, l);
        activePickerColor = color;
        pickerPreview.style.backgroundColor = color;

        // 가운데 창(캔버스)에 실시간 색상 피드백 반영!
        if (activePickerCallback) {
            activePickerCallback(color);
        }
    };

    pickerHue.addEventListener('input', onSliderChange);
    pickerLightness.addEventListener('input', onSliderChange);

    pickerApplyBtn.addEventListener('click', () => {
        // 확정 적용이므로 실시간 반영된 상태 그대로 픽스
        customColorPicker.style.display = 'none';
    });

    // 외부 클릭 시 닫기 (실시간 변경 완료된 색상 그대로 유지 확정)
    document.addEventListener('mousedown', (e) => {
        if (customColorPicker.style.display === 'flex') {
            if (!customColorPicker.contains(e.target) && !activePickerTarget.contains(e.target)) {
                customColorPicker.style.display = 'none';
            }
        }
    });

    const toolPencil = document.getElementById('tool-pencil');
    const toolLine = document.getElementById('tool-line');
    const toolEraser = document.getElementById('tool-eraser');
    const toolClear = document.getElementById('tool-clear');

    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    const snapHVInput = document.getElementById('snap-hv');

    const symmetryEnable = document.getElementById('symmetry-enable');
    const symmetryCount = document.getElementById('symmetry-count');
    const symmetryCountVal = document.getElementById('symmetry-count-val');
    const symmetryCountWrapper = document.getElementById('symmetry-count-wrapper');

    const offsetStepInput = document.getElementById('offset-step');
    const btnGenerateOffset = document.getElementById('btn-generate-offset');
    const layerListContainer = document.getElementById('layer-list-container');
    const loadingOverlay = document.getElementById('loading-overlay');

    const btnColorAll = document.getElementById('btn-color-all');
    const btnColorRainbow = document.getElementById('btn-color-rainbow');
    const btnColorRandom = document.getElementById('btn-color-random');

    // 패턴 배색 엘리먼트 & 변수 정의
    const btnThreadCount2 = document.getElementById('btn-thread-count-2');
    const btnThreadCount3 = document.getElementById('btn-thread-count-3');
    const btnThreadCount4 = document.getElementById('btn-thread-count-4');
    const btnThreadCount5 = document.getElementById('btn-thread-count-5');
    const threadColorsWrapper = document.getElementById('thread-colors-wrapper');
    const threadColorAEl = document.getElementById('thread-color-a');
    const threadColorBEl = document.getElementById('thread-color-b');
    const threadColorCEl = document.getElementById('thread-color-c');
    const threadColorDEl = document.getElementById('thread-color-d');
    const threadColorEEl = document.getElementById('thread-color-e');
    const patternRuleSelect = document.getElementById('pattern-rule-select');
    const btnApplyPattern = document.getElementById('btn-apply-pattern');

    let threadCount = 2;
    let threadColorA = '#9e2a2b'; // 실 A 기본 (딥 버건디)
    let threadColorB = '#c3bfd8'; // 실 B 기본 (연보라)
    let threadColorC = '#3a5a40'; // 실 C 기본 (비취)
    let threadColorD = '#3a506b'; // 실 D 기본 (감청색)
    let threadColorE = '#d9a05b'; // 실 E 기본 (사구황토색)

    const btnExportSvg = document.getElementById('btn-export-svg');
    const btnExportPng = document.getElementById('btn-export-png');

    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const btnZoomReset = document.getElementById('btn-zoom-reset');
    const zoomLevelVal = document.getElementById('zoom-level');

    const leftSidebar = document.getElementById('left-sidebar');
    const rightSidebar = document.getElementById('right-sidebar');
    const mobileLeftToggle = document.getElementById('mobile-left-toggle');
    const mobileRightToggle = document.getElementById('mobile-right-toggle');

    let currentZoom = 1.0;

    mobileLeftToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        leftSidebar.classList.toggle('active');
        rightSidebar.classList.remove('active');
    });

    mobileRightToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        rightSidebar.classList.toggle('active');
        leftSidebar.classList.remove('active');
    });

    // 모바일 사이드바 내부 닫기 버튼 이벤트 바인딩
    document.querySelectorAll('.mobile-close-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            leftSidebar.classList.remove('active');
            rightSidebar.classList.remove('active');
        });
    });

    // 모바일 사이드바 외부 영역(캔버스 영역) 클릭 시 닫기
    const workspaceEl = document.querySelector('.workspace');
    if (workspaceEl) {
        workspaceEl.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                leftSidebar.classList.remove('active');
                rightSidebar.classList.remove('active');
            }
        });
    }

    function updateCanvasSize() {
        const w = parseInt(canvasWidthInput.value) || 20;
        const h = parseInt(canvasHeightInput.value) || 20;
        manager.setDimensions(w, h);
        fitCanvasToScreen();
    }

    canvasWidthInput.addEventListener('change', updateCanvasSize);
    canvasHeightInput.addEventListener('change', updateCanvasSize);

    // 원단 설정 카드의 텍스트 가독성 및 배경색 갱신 (배경색 명도에 따른 선 가독성 자동 보정 연동)
    function updateFabricCard(color) {
        updateCardStyle(fabricColorCard, color);
        manager.setBackgroundColor(color);

        // 배경색 밝기 YIQ 계산
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const yiq = (r * 299 + g * 587 + b * 114) / 1000;

        // 원단이 어두우면 스케치선/도안선 기본값을 밝은 연보라(#c3bfd8), 밝으면 딥 버건디(#9e2a2b)로 자동 전환
        const targetStrokeColor = yiq < 165 ? '#c3bfd8' : '#9e2a2b';
        const oldStrokeColor = manager.strokeColor;
        manager.strokeColor = targetStrokeColor;

        // 캔버스에 이미 그려진 선들도 대비가 맞는 선색으로 자동 변경
        manager.strokes.forEach(stroke => {
            if (stroke.color !== 'eraser' && stroke.color === oldStrokeColor) {
                stroke.color = targetStrokeColor;
            }
        });

        manager.offsetPaths.forEach(path => {
            if (path.color === oldStrokeColor) {
                path.color = targetStrokeColor;
            }
        });

        manager.render();
        
        // 우측 라인 리스트 UI도 자동 변경된 색상으로 단장
        if (typeof updateLayerListUI === 'function') {
            updateLayerListUI();
        }
    }

    fabricColorCard.addEventListener('click', () => {
        openCustomColorPicker(fabricColorCard, manager.bgColor || '#fcf6f5', (selectedColor) => {
            updateFabricCard(selectedColor);
        });
    });
    
    // 초기 원단 색상 대비 가독성 렌더링
    updateFabricCard(manager.bgColor || '#fcf6f5');

    const tools = [
        { btn: toolPencil, type: 'pencil' },
        { btn: toolLine, type: 'line' },
        { btn: toolEraser, type: 'eraser' }
    ];

    tools.forEach(tool => {
        tool.btn.addEventListener('click', () => {
            tools.forEach(t => t.btn.classList.remove('active'));
            tool.btn.classList.add('active');
            manager.setTool(tool.type);
        });
    });

    toolClear.addEventListener('click', () => {
        if (confirm('스케치 및 생성된 모든 도안이 삭제됩니다. 정말 삭제하시겠습니까?')) {
            manager.clear();
            updateLayerListUI();
        }
    });

    btnUndo.addEventListener('click', () => {
        manager.undo();
    });

    btnRedo.addEventListener('click', () => {
        if (confirm('처음 만든 원단 상태로 돌아가시겠습니까? 모든 작업 내용이 초기화됩니다.')) {
            // 원단 설정 초기값으로 복원
            canvasWidthInput.value = 16;
            canvasHeightInput.value = 10;
            updateCanvasSize();
            updateFabricCard('#fcf6f5');
            
            // 그리기 상태 및 도구 초기화
            manager.clear();
            manager.regions = [];
            manager.getRegionAtPixel = null;
            
            tools.forEach(t => t.btn.classList.remove('active'));
            toolLine.classList.add('active');
            manager.setTool('line');
            
            snapHVInput.checked = true;
            manager.snapHV = true;
            
            symmetryEnable.checked = false;
            updateSymmetryConfig();
            
            // UI 업데이트
            updateLayerListUI();
            updateRegionListUI();
        }
    });

    // 수직/수평 그리기 스냅 체크박스 이벤트 바인딩 및 초기화
    manager.snapHV = snapHVInput.checked;
    snapHVInput.addEventListener('change', (e) => {
        manager.snapHV = e.target.checked;
    });

    // 정밀 수치 입력 그리기 바인딩
    const btnDrawPrecise = document.getElementById('btn-draw-precise');
    const preciseLengthInput = document.getElementById('precise-length');
    const preciseAngleSelect = document.getElementById('precise-angle');

    btnDrawPrecise.addEventListener('click', () => {
        const lenCm = parseFloat(preciseLengthInput.value) || 5;
        const angleDeg = parseFloat(preciseAngleSelect.value) || 0;
        
        // cm 단위를 픽셀로 변환 (1cm = 40px)
        const lenPx = lenCm * manager.pixelScale;
        const angleRad = (angleDeg * Math.PI) / 180;

        const cx = manager.canvas.width / 2;
        const cy = manager.canvas.height / 2;

        // 중앙에서부터 지정된 방향과 길이로 선분의 끝점 계산
        const startX = cx - (lenPx / 2) * Math.cos(angleRad);
        const startY = cy - (lenPx / 2) * Math.sin(angleRad);
        const endX = cx + (lenPx / 2) * Math.cos(angleRad);
        const endY = cy + (lenPx / 2) * Math.sin(angleRad);

        manager.currentStroke = {
            id: Date.now(),
            tool: 'line',
            color: manager.strokeColor,
            width: manager.strokeWidth,
            segments: []
        };

        // 대지 중앙을 대칭 중심축으로 임시 대입
        const originalCenter = manager.symmetryCenter;
        manager.symmetryCenter = { x: cx, y: cy };

        manager.addSegments(startX, startY, endX, endY);

        // 복원
        manager.symmetryCenter = originalCenter;

        if (manager.currentStroke.segments.length > 0) {
            manager.strokes.push(manager.currentStroke);
            manager.redoStrokes = [];
        }
        manager.currentStroke = null;
        manager.render();
    });

    function updateSymmetryConfig() {
        const isEnabled = symmetryEnable.checked;
        const count = parseInt(symmetryCount.value);
        
        if (symmetryCountVal) {
            symmetryCountVal.innerText = count;
        }
        symmetryCountWrapper.style.opacity = isEnabled ? '1' : '0.5';
        symmetryCount.disabled = !isEnabled;

        manager.setSymmetry(isEnabled, count);
    }

    symmetryEnable.addEventListener('change', updateSymmetryConfig);
    symmetryCount.addEventListener('change', updateSymmetryConfig);
    updateSymmetryConfig();



    // 대칭 경계면이나 교차점에서 선이 두 번 중복 렌더링되어 대각선이 진해지는 것을 방지하는 세그먼트 중복 제거 헬퍼
    function deduplicateSegments(segments) {
        const result = [];
        const eps = 1.5; // 1.5px 이내의 미세 오차 허용
        const dist2 = (p1, p2) => (p1.x - p2.x)**2 + (p1.y - p2.y)**2;

        segments.forEach(seg => {
            const A1 = { x: seg.x1, y: seg.y1 };
            const B1 = { x: seg.x2, y: seg.y2 };

            const isDuplicate = result.some(saved => {
                const A2 = { x: saved.x1, y: saved.y1 };
                const B2 = { x: saved.x2, y: saved.y2 };

                const matchDirect = dist2(A1, A2) < eps && dist2(B1, B2) < eps;
                const matchReverse = dist2(A1, B2) < eps && dist2(B1, A2) < eps;
                return matchDirect || matchReverse;
            });

            if (!isDuplicate) {
                result.push(seg);
            }
        });
        return result;
    }

    btnGenerateOffset.addEventListener('click', () => {
        let activeSegments = manager.getActiveSegments();
        
        if (activeSegments.length === 0) {
            alert('도안을 생성하려면 먼저 캔버스에 선을 그려주세요!');
            return;
        }

        // 대각선 겹침 중복선 제거 연산 수행
        activeSegments = deduplicateSegments(activeSegments);

        loadingOverlay.style.display = 'flex';

        setTimeout(() => {
            try {
                const canvasW = manager.canvas.width;
                const canvasH = manager.canvas.height;
                
                const stepMm = parseFloat(offsetStepInput.value) || 2.5;
                const stepPx = stepMm * 4;

                const generatedPaths = generateOffsets(canvasW, canvasH, activeSegments, stepPx, 300);
                
                // 닫힌 영역(방) 감지 및 12시 방향 기준 정렬
                const regionData = detectRegionsAndMap(canvasW, canvasH, activeSegments);
                manager.regions = regionData.regions;
                manager.getRegionAtPixel = regionData.getRegionAtPixel;

                // 도안선 paths 색상을 방 색상으로 매핑
                generatedPaths.forEach(path => {
                    if (path.points && path.points.length > 0) {
                        const midPt = path.points[Math.floor(path.points.length / 2)];
                        const reg = manager.getRegionAtPixel(midPt.x, midPt.y);
                        if (reg) {
                            path.color = reg.color;
                            path.regionId = reg.id;
                        } else {
                            path.color = '#9e2a2b';
                        }
                    } else {
                        path.color = '#9e2a2b';
                    }
                });

                // 스케치선도 속한 방 색상으로 적용
                manager.strokes.forEach(stroke => {
                    if (stroke.color !== 'eraser' && stroke.segments.length > 0) {
                        const midSeg = stroke.segments[Math.floor(stroke.segments.length / 2)];
                        const reg = manager.getRegionAtPixel((midSeg.x1 + midSeg.x2) / 2, (midSeg.y1 + midSeg.y2) / 2);
                        if (reg) {
                            stroke.color = reg.color;
                        }
                    }
                });

                manager.offsetPaths = generatedPaths;
                manager.render();

                updateRegionListUI();
                updateLayerListUI();
            } catch (err) {
                console.error(err);
                alert('도안 생성 중 오류가 발생했습니다. 선의 양이 너무 많거나 계산 범위가 초과되었을 수 있습니다.');
            } finally {
                loadingOverlay.style.display = 'none';
                if (window.innerWidth < 768) {
                    rightSidebar.classList.add('active');
                }
            }
        }, 50);
    });

    function updateLayerListUI() {
        layerListContainer.innerHTML = '';

        if (!manager.offsetPaths || manager.offsetPaths.length === 0) {
            return;
        }

        // 0. 원본 스케치 가이드선 컬러 카드
        if (manager.strokes.length > 0) {
            const sketchColor = manager.strokes[0].color || manager.strokeColor;
            
            const item = document.createElement('div');
            item.className = 'layer-item';
            item.style.position = 'relative';
            item.style.cursor = 'pointer';
            item.style.transition = 'background-color 0.2s';

            item.innerHTML = `
                <div class="layer-info">
                    <span style="font-weight: 500;">원본 스케치선</span>
                </div>
                <span class="change-btn" style="font-size: 0.75rem; opacity: 0.8; font-weight: 400;">변경</span>
            `;
            
            // 색상에 따른 텍스트 대비 반영
            updateCardStyle(item, sketchColor);
            
            item.addEventListener('click', () => {
                const currentColor = manager.strokes[0].color || manager.strokeColor;
                openCustomColorPicker(item, currentColor, (color) => {
                    updateCardStyle(item, color);
                    manager.strokeColor = color;
                    manager.strokes.forEach(stroke => {
                        if (stroke.color !== 'eraser') {
                            stroke.color = color;
                        }
                    });
                    manager.render();
                });
            });
            
            layerListContainer.appendChild(item);
        }

        const layerGroups = {};
        manager.offsetPaths.forEach(path => {
            if (!layerGroups[path.layerIndex]) {
                layerGroups[path.layerIndex] = {
                    index: path.layerIndex,
                    distance: path.distance,
                    paths: []
                };
            }
            layerGroups[path.layerIndex].paths.push(path);
        });

        const sortedLayers = Object.values(layerGroups).sort((a, b) => a.index - b.index);

        sortedLayers.forEach(layer => {
            const defaultColor = layer.paths[0].color || '#9e2a2b';

            const item = document.createElement('div');
            item.className = 'layer-item';
            item.style.position = 'relative';
            item.style.cursor = 'pointer';
            item.style.transition = 'background-color 0.2s';

            item.innerHTML = `
                <div class="layer-info">
                    <span style="font-weight: 500;">단계 ${layer.index + 1}</span>
                </div>
                <span class="change-btn" style="font-size: 0.75rem; opacity: 0.8; font-weight: 400;">변경</span>
            `;

            updateCardStyle(item, defaultColor);

            item.addEventListener('click', () => {
                const currentColor = layer.paths[0].color || '#9e2a2b';
                openCustomColorPicker(item, currentColor, (color) => {
                    updateCardStyle(item, color);
                    manager.offsetPaths.forEach(path => {
                        if (path.layerIndex === layer.index) {
                            path.color = color;
                        }
                    });
                    manager.render();
                });
            });

            layerListContainer.appendChild(item);
        });
    }

    // 사용할 실 개수(2색 / 3색 / 4색 / 5색) UI 및 드롭다운 규칙 갱신
    function updateThreadCountUI(count) {
        threadCount = count;
        
        // active 클래스 리셋 및 설정
        btnThreadCount2.classList.toggle('active', count === 2);
        btnThreadCount3.classList.toggle('active', count === 3);
        btnThreadCount4.classList.toggle('active', count === 4);
        btnThreadCount5.classList.toggle('active', count === 5);

        // 실 카드 보이기/숨기기
        threadColorCEl.style.display = count >= 3 ? 'flex' : 'none';
        threadColorDEl.style.display = count >= 4 ? 'flex' : 'none';
        threadColorEEl.style.display = count >= 5 ? 'flex' : 'none';

        // 4색은 2x2로 뜨게 하고, 3/5색은 3열(3+2) 배분하여 레이아웃 대칭성 확보
        if (threadColorsWrapper) {
            if (count === 2) {
                threadColorsWrapper.style.gridTemplateColumns = 'repeat(2, 1fr)';
            } else if (count === 3) {
                threadColorsWrapper.style.gridTemplateColumns = 'repeat(3, 1fr)';
            } else if (count === 4) {
                threadColorsWrapper.style.gridTemplateColumns = 'repeat(2, 1fr)'; // 2x2!
            } else if (count === 5) {
                threadColorsWrapper.style.gridTemplateColumns = 'repeat(3, 1fr)'; // 3+2!
            }
        }

        if (count === 2) {
            patternRuleSelect.innerHTML = `
                <option value="A-B">A - B (교차)</option>
                <option value="A-B-B">A - B - B</option>
                <option value="A-A-B">A - A - B</option>
                <option value="A-B-B-B">A - B - B - B</option>
            `;
        } else if (count === 3) {
            patternRuleSelect.innerHTML = `
                <option value="A-B-C">A - B - C (순차)</option>
                <option value="A-A-B-C">A - A - B - C</option>
                <option value="A-B-B-C">A - B - B - C</option>
                <option value="A-B-C-C">A - B - C - C</option>
            `;
        } else if (count === 4) {
            patternRuleSelect.innerHTML = `
                <option value="A-B-C-D">A - B - C - D (순차)</option>
                <option value="A-A-B-C-D">A - A - B - C - D</option>
                <option value="A-B-B-C-D">A - B - B - C - D</option>
                <option value="A-B-C-D-D">A - B - C - D - D</option>
            `;
        } else if (count === 5) {
            patternRuleSelect.innerHTML = `
                <option value="A-B-C-D-E">A - B - C - D - E (순차)</option>
                <option value="A-A-B-C-D-E">A - A - B - C - D - E</option>
                <option value="A-B-C-D-E-E">A - B - C - D - E - E</option>
            `;
        }
    }

    // 2색 / 3색 / 4색 / 5색 토글 바인딩
    btnThreadCount2.addEventListener('click', () => updateThreadCountUI(2));
    btnThreadCount3.addEventListener('click', () => updateThreadCountUI(3));
    btnThreadCount4.addEventListener('click', () => updateThreadCountUI(4));
    btnThreadCount5.addEventListener('click', () => updateThreadCountUI(5));

    // 실 색상 변경 카드 이벤트 바인딩 (실시간 컬러 피커 연동)
    threadColorAEl.addEventListener('click', () => {
        openCustomColorPicker(threadColorAEl, threadColorA, (color) => {
            threadColorA = color;
            updateCardStyle(threadColorAEl, color);
        });
    });

    threadColorBEl.addEventListener('click', () => {
        openCustomColorPicker(threadColorBEl, threadColorB, (color) => {
            threadColorB = color;
            updateCardStyle(threadColorBEl, color);
        });
    });

    threadColorCEl.addEventListener('click', () => {
        openCustomColorPicker(threadColorCEl, threadColorC, (color) => {
            threadColorC = color;
            updateCardStyle(threadColorCEl, color);
        });
    });

    threadColorDEl.addEventListener('click', () => {
        openCustomColorPicker(threadColorDEl, threadColorD, (color) => {
            threadColorD = color;
            updateCardStyle(threadColorDEl, color);
        });
    });

    threadColorEEl.addEventListener('click', () => {
        openCustomColorPicker(threadColorEEl, threadColorE, (color) => {
            threadColorE = color;
            updateCardStyle(threadColorEEl, color);
        });
    });

    // 초기 카드 컬러 & 글자 대비 적용
    updateCardStyle(threadColorAEl, threadColorA);
    updateCardStyle(threadColorBEl, threadColorB);
    updateCardStyle(threadColorCEl, threadColorC);
    updateCardStyle(threadColorDEl, threadColorD);
    updateCardStyle(threadColorEEl, threadColorE);
    updateThreadCountUI(2); // 기본 2색 활성화 (좌우 2열 배치)
    // 사용방법 가이드 모달 이벤트 핸들러
    const guideModal = document.getElementById('guide-modal');
    const btnOpenGuide = document.getElementById('btn-open-guide');
    const btnCloseGuideX = document.getElementById('btn-close-guide-x');
    const btnCloseGuideBtn = document.getElementById('btn-close-guide-btn');

    const mobileGuideBtn = document.getElementById('mobile-guide-btn');
    if (guideModal) {
        const openGuide = () => {
            guideModal.style.display = 'flex';
        };
        if (btnOpenGuide) btnOpenGuide.addEventListener('click', openGuide);
        if (mobileGuideBtn) mobileGuideBtn.addEventListener('click', openGuide);
    }

    const closeGuide = () => {
        if (guideModal) guideModal.style.display = 'none';
    };

    if (btnCloseGuideX) btnCloseGuideX.addEventListener('click', closeGuide);
    if (btnCloseGuideBtn) btnCloseGuideBtn.addEventListener('click', closeGuide);
    if (guideModal) {
        guideModal.addEventListener('click', (e) => {
            if (e.target === guideModal) closeGuide();
        });
    }

    // 각 제목 옆 [?] 힌트 버튼 토글 이벤트
    document.querySelectorAll('.btn-help-hint').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetId = btn.getAttribute('data-target');
            const targetBox = document.getElementById(targetId);
            if (targetBox) {
                const isHidden = targetBox.style.display === 'none';
                document.querySelectorAll('.help-hint-box').forEach(box => box.style.display = 'none');
                targetBox.style.display = isHidden ? 'block' : 'none';
            }
        });
    });

    // 패턴 배색 적용 핵심 알고리즘
    btnApplyPattern.addEventListener('click', () => {
        if (manager.offsetPaths.length === 0 && manager.strokes.length === 0) return;

        const pattern = patternRuleSelect.value.split('-'); // 예: ['A', 'B', 'B']
        const colors = {
            'A': threadColorA,
            'B': threadColorB,
            'C': threadColorC,
            'D': threadColorD,
            'E': threadColorE
        };

        // 1. strokes (가이드 스케치선) — 전체를 하나의 묶음으로 인식하여 패턴 첫 번째 색 일괄 적용
        const sketchThreadKey = pattern[0];
        manager.strokes.forEach((stroke) => {
            if (stroke.color !== 'eraser') {
                stroke.color = colors[sketchThreadKey];
            }
        });

        // 2. offsetPaths (생성된 오프셋 도안선) 색상 패턴 렌더링
        // 스케치선 다음 순서부터 도안선 레이어(layerIndex 0, 1, 2...)가 연속되도록 매핑
        manager.offsetPaths.forEach(path => {
            // 원본 스케치선의 뒤를 잇는 땀 단계에 맞춰 주기 매핑
            const patternIndex = (path.layerIndex + 1) % pattern.length;
            const threadKey = pattern[patternIndex];
            path.color = colors[threadKey];
        });

        // 3. 방 별 대표 색상도 패턴 색상으로 동기화
        if (manager.regions && manager.regions.length > 0) {
            manager.regions.forEach(reg => {
                const samplePath = manager.offsetPaths.find(p => {
                    if (!p.points || p.points.length === 0) return false;
                    const midPt = p.points[Math.floor(p.points.length / 2)];
                    const r = manager.getRegionAtPixel ? manager.getRegionAtPixel(midPt.x, midPt.y) : null;
                    return r && r.id === reg.id;
                });
                if (samplePath) {
                    reg.color = samplePath.color;
                }
            });
            updateRegionListUI();
        }

        manager.render();
        updateLayerListUI();
    });

    btnColorAll.addEventListener('click', () => {
        if (manager.offsetPaths.length === 0 && manager.strokes.length === 0) return;

        // 현재 버튼 배경색을 기본값으로 사용
        const currentBg = btnColorAll.style.backgroundColor || '#9e2a2b';
        const defaultColor = currentBg.startsWith('rgb') ? rgbToHex(currentBg) : currentBg;

        openCustomColorPicker(btnColorAll, defaultColor, (selectedColor) => {
            manager.offsetPaths.forEach(path => {
                path.color = selectedColor;
            });

            manager.strokeColor = selectedColor;
            manager.strokes.forEach(stroke => {
                if (stroke.color !== 'eraser') {
                    stroke.color = selectedColor;
                }
            });

            // 방별 색상 카드도 일괄 변경 색상으로 갱신
            if (manager.regions) {
                manager.regions.forEach(reg => reg.color = selectedColor);
                updateRegionListUI();
            }

            // 버튼 배경색도 선택한 컬러로 갱신
            updateCardStyle(btnColorAll, selectedColor);

            manager.render();
            updateLayerListUI();
        });
    });

    if (btnColorRainbow) {
        btnColorRainbow.addEventListener('click', () => {
            if (manager.offsetPaths.length === 0) return;
            const maxLayer = Math.max(...manager.offsetPaths.map(p => p.layerIndex)) + 1;

            manager.offsetPaths.forEach(path => {
                const hue = (path.layerIndex / maxLayer) * 360;
                path.color = `hsl(${hue}, 70%, 45%)`;
            });
            manager.render();
            updateLayerListUI();
        });
    }

    btnColorRandom.addEventListener('click', () => {
        if (manager.offsetPaths.length === 0) return;

        const maxLayer = Math.max(...manager.offsetPaths.map(p => p.layerIndex)) + 1;
        const selectedColors = [];
        
        for (let i = 0; i < maxLayer; i++) {
            const randColor = TRADITIONAL_PALETTE[Math.floor(Math.random() * TRADITIONAL_PALETTE.length)];
            selectedColors.push(randColor);
        }

        manager.offsetPaths.forEach(path => {
            path.color = selectedColors[path.layerIndex];
        });

        // 랜덤 배색 버튼 배경을 첫 번째 랜덤 컬러로 갱신
        if (selectedColors.length > 0) {
            updateCardStyle(btnColorRandom, selectedColors[0]);
        }

        manager.render();
        updateLayerListUI();
    });

    function setZoomValue(zoom) {
        currentZoom = zoom;
        manager.setZoom(currentZoom);
        zoomLevelVal.innerText = `${Math.round(currentZoom * 100)}%`;
    }

    btnZoomIn.addEventListener('click', () => {
        setZoomValue(currentZoom + 0.1);
    });

    btnZoomOut.addEventListener('click', () => {
        setZoomValue(currentZoom - 0.1);
    });

    btnZoomReset.addEventListener('click', () => {
        fitCanvasToScreen();
    });

    function fitCanvasToScreen() {
        const workspaceW = manager.container.parentElement.clientWidth - 80;
        const workspaceH = manager.container.parentElement.clientHeight - 80;
        const canvasW = manager.widthCm * manager.pixelScale;
        const canvasH = manager.heightCm * manager.pixelScale;

        const scaleW = workspaceW / canvasW;
        const scaleH = workspaceH / canvasH;
        const optimalZoom = Math.min(scaleW, scaleH, 1.2);

        setZoomValue(optimalZoom);
    }

    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            fitCanvasToScreen();
        }
    });

    if (btnExportSvg) {
        btnExportSvg.addEventListener('click', () => {
            if (!manager.offsetPaths || manager.offsetPaths.length === 0) {
                alert('내보낼 오프셋 도안이 없습니다. 도안을 먼저 생성해주세요!');
                return;
            }

            const wCm = manager.widthCm;
            const hCm = manager.heightCm;
            const wPx = wCm * manager.pixelScale;
            const hPx = hCm * manager.pixelScale;

            let svgStr = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n`;
            svgStr += `<svg width="${wCm * 10}mm" height="${hCm * 10}mm" viewBox="0 0 ${wPx} ${hPx}" xmlns="http://www.w3.org/2000/svg">\n`;
            svgStr += `  <rect width="100%" height="100%" fill="${manager.bgColor}" />\n`;

            manager.offsetPaths.forEach((path, idx) => {
                if (!path.points || path.points.length < 2) return;

                let pathD = `M ${path.points[0].x.toFixed(2)} ${path.points[0].y.toFixed(2)}`;
                for (let i = 1; i < path.points.length; i++) {
                    pathD += ` L ${path.points[i].x.toFixed(2)} ${path.points[i].y.toFixed(2)}`;
                }

                if (path.isClosed) {
                    pathD += ' Z';
                }

                const strokeColor = path.color || '#9e2a2b';
                const dashStyle = `${manager.dashLength},${manager.dashGap}`;

                svgStr += `  <path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${dashStyle}" id="offset-layer-${path.layerIndex}-path-${idx}" />\n`;
            });

            svgStr += `</svg>`;

            const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `saeksilnubi_pattern_${wCm}x${hCm}.svg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        });
    }

    btnExportPng.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = `saeksilnubi_pattern_${manager.widthCm}x${manager.heightCm}.png`;
        manager.render();
        link.href = manager.canvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // ==========================================
    // 닫힌 방(Region) 감지 및 영역별 색상 지정 모듈
    // ==========================================
    function detectRegionsAndMap(width, height, segments) {
        const gridW = 160;
        const gridH = Math.max(20, Math.round(160 * (height / width)));
        const cellW = width / gridW;
        const cellH = height / gridH;

        // 0: 빈 공간, 1: 차단 벽
        const grid = Array(gridW).fill(0).map(() => new Int32Array(gridH).fill(0));

        // 1. 외각 테두리를 벽(1)으로 칠하기
        for (let x = 0; x < gridW; x++) {
            grid[x][0] = 1;
            grid[x][gridH - 1] = 1;
        }
        for (let y = 0; y < gridH; y++) {
            grid[0][y] = 1;
            grid[gridW - 1][y] = 1;
        }

        // 2. 스케치 선분(segments)을 격자에 벽(1)으로 마킹
        segments.forEach(seg => {
            const x1 = Math.max(0, Math.min(gridW - 1, Math.round(seg.x1 / cellW)));
            const y1 = Math.max(0, Math.min(gridH - 1, Math.round(seg.y1 / cellH)));
            const x2 = Math.max(0, Math.min(gridW - 1, Math.round(seg.x2 / cellW)));
            const y2 = Math.max(0, Math.min(gridH - 1, Math.round(seg.y2 / cellH)));

            const dx = Math.abs(x2 - x1);
            const dy = Math.abs(y2 - y1);
            const steps = Math.max(dx, dy, 1);
            for (let i = 0; i <= steps; i++) {
                const gx = Math.round(x1 + (x2 - x1) * (i / steps));
                const gy = Math.round(y1 + (y2 - y1) * (i / steps));
                if (gx >= 0 && gx < gridW && gy >= 0 && gy < gridH) {
                    grid[gx][gy] = 1;
                }
            }
        });

        // 3. Flood Fill (BFS)로 각 방 영역 식별
        const regionMap = Array(gridW).fill(0).map(() => new Int32Array(gridH).fill(0));
        const visited = Array(gridW).fill(0).map(() => new Uint8Array(gridH).fill(0));
        
        let currentRegionId = 0;
        const regionList = [];

        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

        for (let x = 1; x < gridW - 1; x++) {
            for (let y = 1; y < gridH - 1; y++) {
                if (grid[x][y] === 0 && !visited[x][y]) {
                    currentRegionId++;
                    let sumX = 0;
                    let sumY = 0;
                    let cellCount = 0;

                    const queue = [[x, y]];
                    visited[x][y] = 1;

                    let head = 0;
                    while (head < queue.length) {
                        const [cx, cy] = queue[head++];
                        regionMap[cx][cy] = currentRegionId;
                        sumX += cx;
                        sumY += cy;
                        cellCount++;

                        for (const [dx, dy] of dirs) {
                            const nx = cx + dx;
                            const ny = cy + dy;
                            if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
                                if (grid[nx][ny] === 0 && !visited[nx][ny]) {
                                    visited[nx][ny] = 1;
                                    queue.push([nx, ny]);
                                }
                            }
                        }
                    }

                    // 최소 5셀 이상의 유효 방 영역만 인식
                    if (cellCount >= 5) {
                        const avgGx = sumX / cellCount;
                        const avgGy = sumY / cellCount;
                        const pixelX = avgGx * cellW;
                        const pixelY = avgGy * cellH;

                        // 12시 방향 기준 극좌표 각도 계산 (12시 방향=0, 시계방향 > 0)
                        const centerCanvasX = width / 2;
                        const centerCanvasY = height / 2;
                        let angle = Math.atan2(pixelX - centerCanvasX, centerCanvasY - pixelY);
                        if (angle < 0) angle += 2 * Math.PI;

                        regionList.push({
                            rawId: currentRegionId,
                            cellCount,
                            pixelX,
                            pixelY,
                            angle
                        });
                    }
                }
            }
        }

        // 4. 12시 방향부터 시계방향 오름차순으로 정렬
        regionList.sort((a, b) => a.angle - b.angle);

        const palette = ['#9e2a2b', '#5a6650', '#3a506b', '#d9a05b', '#c3bfd8', '#8d5b4c', '#4a5759', '#70587c', '#52796f', '#e07a5f'];

        const finalRegions = regionList.map((r, idx) => {
            return {
                id: idx + 1,
                rawId: r.rawId,
                name: `방 ${idx + 1}`,
                color: palette[idx % palette.length],
                pixelX: r.pixelX,
                pixelY: r.pixelY
            };
        });

        // Lookup 맵 생성
        const rawToFinalId = {};
        finalRegions.forEach(fr => {
            rawToFinalId[fr.rawId] = fr;
        });

        function getRegionAtPixel(px, py) {
            const gx = Math.max(0, Math.min(gridW - 1, Math.floor(px / cellW)));
            const gy = Math.max(0, Math.min(gridH - 1, Math.floor(py / cellH)));
            const rawId = regionMap[gx][gy];
            if (rawToFinalId[rawId]) {
                return rawToFinalId[rawId];
            }
            // 경계선 부근 8방향 이웃 탐색
            for (let ox = -2; ox <= 2; ox++) {
                for (let oy = -2; oy <= 2; oy++) {
                    const nx = Math.max(0, Math.min(gridW - 1, gx + ox));
                    const ny = Math.max(0, Math.min(gridH - 1, gy + oy));
                    const rid = regionMap[nx][ny];
                    if (rawToFinalId[rid]) {
                        return rawToFinalId[rid];
                    }
                }
            }
            return finalRegions[0] || null;
        }

        return {
            regions: finalRegions,
            getRegionAtPixel
        };
    }

    function updateRegionListUI() {
        const regionColorsWrapper = document.getElementById('region-colors-wrapper');
        const regionInfoText = document.getElementById('region-info-text');

        if (!regionColorsWrapper) return;
        regionColorsWrapper.innerHTML = '';

        if (!manager.regions || manager.regions.length === 0) {
            if (regionInfoText) {
                regionInfoText.textContent = '도안 생성 시 방 개수가 자동 인식됩니다.';
            }
            return;
        }

        if (regionInfoText) {
            regionInfoText.textContent = `인식된 방: 총 ${manager.regions.length}개 (12시 방향부터 시계방향)`;
        }

        manager.regions.forEach(reg => {
            const item = document.createElement('div');
            item.className = 'layer-item';
            item.style.cssText = `cursor: pointer; padding: 8px 14px; font-size: 0.72rem; display: flex; justify-content: space-between; align-items: center; border-radius: 9999px; transition: background-color 0.2s; box-sizing: border-box; min-height: 36px; width: 100%;`;
            
            item.innerHTML = `
                <span style="font-weight: 600;">${reg.name}</span>
                <span style="font-size: 0.6rem; opacity: 0.75;">변경</span>
            `;

            updateCardStyle(item, reg.color);

            item.addEventListener('click', () => {
                openCustomColorPicker(item, reg.color, (selectedColor) => {
                    reg.color = selectedColor;
                    updateCardStyle(item, selectedColor);

                    // 오프셋선 및 스케치선 색상 업데이트
                    if (manager.offsetPaths) {
                        manager.offsetPaths.forEach(path => {
                            if (path.points && path.points.length > 0) {
                                const midPt = path.points[Math.floor(path.points.length / 2)];
                                const r = manager.getRegionAtPixel ? manager.getRegionAtPixel(midPt.x, midPt.y) : null;
                                if (r && r.id === reg.id) {
                                    path.color = selectedColor;
                                }
                            }
                        });
                    }

                    if (manager.strokes) {
                        manager.strokes.forEach(stroke => {
                            if (stroke.color !== 'eraser' && stroke.segments.length > 0) {
                                const midSeg = stroke.segments[Math.floor(stroke.segments.length / 2)];
                                const r = manager.getRegionAtPixel ? manager.getRegionAtPixel((midSeg.x1 + midSeg.x2) / 2, (midSeg.y1 + midSeg.y2) / 2) : null;
                                if (r && r.id === reg.id) {
                                    stroke.color = selectedColor;
                                }
                            }
                        });
                    }

                    manager.render();
                    updateLayerListUI();
                });
            });

            regionColorsWrapper.appendChild(item);
        });
    }

    setTimeout(fitCanvasToScreen, 100);
});
