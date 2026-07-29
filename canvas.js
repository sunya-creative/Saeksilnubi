// canvas.js - 드로잉 및 캔버스 관리 모듈

export class CanvasManager {
    constructor(canvasId, containerId) {
        this.canvas = document.getElementById(canvasId);
        this.container = document.getElementById(containerId);
        this.ctx = this.canvas.getContext('2d');

        // 드로잉 상태 변수
        this.isDrawing = false;
        this.currentTool = 'pencil'; // 'pencil', 'line', 'eraser'
        this.strokeWidth = 2.5; // 기본 스케치 선 두께
        this.strokeColor = '#e63946'; // 기본 스케치 선 색상
        this.bgColor = '#e6dfd3'; // 대지 배경색

        // 대지 크기 설정 (cm 단위 및 픽셀 스케일)
        this.widthCm = 20;
        this.heightCm = 20;
        this.pixelScale = 40; // 1cm = 40px (1mm = 4px, 2.5mm = 10px)

        // 대칭 설정
        this.useSymmetry = true;
        this.symmetryCount = 8;
        this.symmetryCenter = { x: 0, y: 0 }; // 로컬 대칭 중심점

        // 데이터 저장소
        this.strokes = []; // { id, tool, segments: [{x1,y1,x2,y2}], color, width }
        this.redoStrokes = [];
        this.currentStroke = null;
        this.lastPoint = { x: 0, y: 0 };
        this.startPoint = { x: 0, y: 0 }; // 직선 도구용 시작점

        // 오프셋 라인 데이터 (offset.js에서 계산된 결과를 저장)
        // [{ points: [{x,y},...], color: string, distance: number }]
        this.offsetPaths = [];
        this.dashLength = 4;
        this.dashGap = 3;
        
        // 뷰어 줌/팬 상태
        this.zoom = 1.0;

        this.initEvents();
        this.resizeCanvas();
    }

    // 실제 가로세로 크기에 따른 캔버스 해상도 조절
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

        // 컨테이너 크기 설정 및 반응형 스케일 조절
        this.updateCanvasCSS();
        this.render();
    }

    updateCanvasCSS() {
        // 화면 크기에 맞게 CSS width/height를 적절히 조절 (줌 비율 반영)
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

    // 마우스 및 터치 좌표 계산
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

        // 캔버스 자체의 내부 해상도(width, height) 상의 픽셀 좌표로 변환
        const x = ((clientX - rect.left) / rect.width) * this.canvas.width;
        const y = ((clientY - rect.top) / rect.height) * this.canvas.height;

        return { x, y };
    }

    initEvents() {
        // 마우스 이벤트
        this.canvas.addEventListener('mousedown', (e) => this.handleStart(e));
        window.addEventListener('mousemove', (e) => this.handleMove(e));
        window.addEventListener('mouseup', () => this.handleEnd());

        // 터치 이벤트 (모바일 지원, 스크롤 방지)
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
    }

    handleStart(e) {
        const coords = this.getCoordinates(e);
        this.isDrawing = true;
        this.lastPoint = coords;
        this.startPoint = coords;

        // 대칭 그리기가 활성화되어 있으면 터치 시작점을 대칭 중심으로 잡음 (로컬 대칭 브러시)
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

        const coords = this.getCoordinates(e);

        if (this.currentTool === 'pencil' || this.currentTool === 'eraser') {
            this.addSegments(this.lastPoint.x, this.lastPoint.y, coords.x, coords.y);
            this.lastPoint = coords;
            this.render();
        } else if (this.currentTool === 'line') {
            // 직선 툴은 드래그 중에 임시 가이드를 보여주고 render에서 그린다.
            this.lastPoint = coords;
            this.render();
            // 실시간 가이드라인 그리기
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
                this.redoStrokes = []; // 새로운 획을 그리면 redo 대기열 초기화
            }
        }
        this.currentStroke = null;
        this.render();
    }

    // 선분 추가 및 대칭 변환 처리
    addSegments(x1, y1, x2, y2) {
        if (!this.currentStroke) return;

        const color = this.currentStroke.color;
        const width = this.currentStroke.width;

        if (this.useSymmetry && color !== 'eraser') {
            // 대칭 그리기인 경우: 대칭 중심을 기준으로 N개 방향으로 회전된 선분을 추가
            const cx = this.symmetryCenter.x;
            const cy = this.symmetryCenter.y;
            const angleStep = (2 * Math.PI) / this.symmetryCount;

            for (let i = 0; i < this.symmetryCount; i++) {
                const angle = i * angleStep;
                
                // x1, y1 회전
                const rx1 = cx + (x1 - cx) * Math.cos(angle) - (y1 - cy) * Math.sin(angle);
                const ry1 = cy + (x1 - cx) * Math.sin(angle) + (y1 - cy) * Math.cos(angle);
                
                // x2, y2 회전
                const rx2 = cx + (x2 - cx) * Math.cos(angle) - (y2 - cy) * Math.sin(angle);
                const ry2 = cy + (x2 - cx) * Math.sin(angle) + (y2 - cy) * Math.cos(angle);

                this.currentStroke.segments.push({ x1: rx1, y1: ry1, x2: rx2, y2: ry2 });
            }
        } else {
            // 일반 드로잉 혹은 지우개
            this.currentStroke.segments.push({ x1, y1, x2: y2 ? x2 : x1, y2: y2 ? y2 : y1 });
        }
    }

    // 직선 그리기 도중 마우스 드래그 가이드라인 그리기
    renderTempLine() {
        this.ctx.save();
        this.ctx.strokeStyle = this.strokeColor;
        this.ctx.lineWidth = this.strokeWidth;
        this.ctx.lineCap = 'round';

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

    // 캔버스 렌더링 루프
    render() {
        // 1. 대지 배경색 채우기
        this.ctx.fillStyle = this.bgColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 2. 오프셋 라인 그리기 (배경 위에 먼저 오프셋 선을 깔아준다)
        this.renderOffsetPaths();

        // 3. 사용자가 그린 스케치 그리기
        this.renderStrokes();

        // 4. 대칭 모드일 때 터치 시작 가이드라인 및 중심 표시 (그리는 중일 때만 표시)
        if (this.isDrawing && this.useSymmetry && this.currentTool !== 'eraser') {
            this.renderSymmetryGuide();
        }
    }

    renderStrokes() {
        this.ctx.save();
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        this.strokes.forEach(stroke => {
            if (stroke.color === 'eraser') {
                // 지우개 모드: 배경색으로 덮어 그리거나, canvas compositing을 활용하여 지운다.
                // 여기서는 간단하게 캔버스 배경색(bgColor)으로 덮어서 그린다.
                this.ctx.strokeStyle = this.bgColor;
                this.ctx.lineWidth = stroke.width;
            } else {
                this.ctx.strokeStyle = stroke.color;
                this.ctx.lineWidth = stroke.width;
            }

            this.ctx.beginPath();
            stroke.segments.forEach(seg => {
                this.ctx.moveTo(seg.x1, seg.y1);
                this.ctx.lineTo(seg.x2, seg.y2);
            });
            this.ctx.stroke();
        });

        // 현재 그리고 있는 획 렌더링 (자유곡선)
        if (this.isDrawing && this.currentStroke && (this.currentTool === 'pencil' || this.currentTool === 'eraser')) {
            if (this.currentStroke.color === 'eraser') {
                this.ctx.strokeStyle = this.bgColor;
                this.ctx.lineWidth = this.currentStroke.width;
            } else {
                this.ctx.strokeStyle = this.currentStroke.color;
                this.ctx.lineWidth = this.currentStroke.width;
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
            this.ctx.lineWidth = 1.5; // 오프셋 실선 두께

            this.ctx.beginPath();
            if (path.points && path.points.length > 0) {
                this.ctx.moveTo(path.points[0].x, path.points[0].y);
                for (let i = 1; i < path.points.length; i++) {
                    this.ctx.lineTo(path.points[i].x, path.points[i].y);
                }
                // 닫힌 루프인 경우
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

        // 중심점 표시
        this.ctx.fillStyle = 'rgba(158, 42, 43, 0.5)';
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 5, 0, 2 * Math.PI);
        this.ctx.fill();

        // 방사 대칭선 그리기
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

    // 데이터 가져오기 (오프셋 SDF 계산용)
    // 캔버스 배경색과 같은 색상의 지우개 스트로크를 고려하여, 유효한 드로잉 선분만 리턴
    getActiveSegments() {
        // 간단한 SDF 생성을 위해 모든 펜 획의 segment들을 병합하여 리턴
        // 단, eraser 영역 근처의 선을 필터링하려면 기하학적 정밀 지우기가 필요하나,
        // 여기서는 지우개 획이 있으면 그 획의 좌표 근처에 있는 선분을 무시하는 방식으로 구현하거나,
        // 복잡도를 줄이기 위해 일반 드로잉 선만 모으되 지우개에 닿은 선분을 필터링하는 로직을 제공할 수 있다.
        let activeSegs = [];

        // 지우개 획들의 중심선분 리스트
        const erasers = this.strokes.filter(s => s.color === 'eraser');

        this.strokes.filter(s => s.color !== 'eraser').forEach(stroke => {
            stroke.segments.forEach(seg => {
                // 이 seg가 지우개 획과 겹치는지 체크
                let isErased = false;
                for (const eraser of erasers) {
                    for (const eseg of eraser.segments) {
                        // 선분-선분 사이의 최소 거리가 지우개 두께(반지름) 이하인지 체크
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

    // 선분 AB와 CD 사이의 최소 거리를 구하는 헬퍼 함수
    getMinDistanceBetweenSegments(seg1, seg2) {
        const A = { x: seg1.x1, y: seg1.y1 };
        const B = { x: seg1.x2, y: seg1.y2 };
        const C = { x: seg2.x1, y: seg2.y1 };
        const D = { x: seg2.x2, y: seg2.y2 };

        // 두 선분이 아주 짧은 점 형태인 경우 처리
        const distSq = (p1, p2) => (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
        
        // 단순화된 최단 거리 근사치 계산
        // 네 끝점 간의 거리를 검사하고 중간 보간
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
