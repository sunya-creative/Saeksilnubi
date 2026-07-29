// offset.js - SDF(Signed Distance Field) 및 Marching Squares 등고선 오프셋 생성 모듈

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
export class DistanceField {
    constructor(width, height, segments, gridSize = 300) {
        this.width = width;
        this.height = height;
        this.segments = segments;

        // 화면 비율에 맞춰 격자 가로세로 수 설정
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

        // SDF 데이터 그리드
        this.grid = [];
        this.maxDistance = Math.sqrt(width * width + height * height);
    }

    // SDF 계산 수행
    calculate() {
        this.grid = Array(this.gridW + 1).fill().map(() => new Float32Array(this.gridH + 1));

        // 사용자가 스케치한 선분이 없을 때 처리
        if (this.segments.length === 0) {
            for (let x = 0; x <= this.gridW; x++) {
                for (let y = 0; y <= this.gridH; y++) {
                    this.grid[x][y] = this.maxDistance;
                }
            }
            return;
        }

        // Bounding box를 이용한 계산 최적화
        // 격자점별로 모든 선분을 무작정 다 돌지 않고, Bounding Box 등을 만들면 좋으나,
        // 보통의 수백 개 선분은 Javascript Float32Array를 이용해 메인스레드에서 O(W*H*N)이어도 20~50ms 내외로 돌 수 있음
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

    // 특정 거리값(threshold)에서의 등고선 추출 (Marching Squares)
    extractIsoline(threshold) {
        const isolineSegments = [];

        // Marching Squares 셀 탐색
        for (let x = 0; x < this.gridW; x++) {
            for (let y = 0; y < this.gridH; y++) {
                // 셀의 4개 코너 값 및 좌표
                const x0 = x * this.cellW;
                const x1 = (x + 1) * this.cellW;
                const y0 = y * this.cellH;
                const y1 = (y + 1) * this.cellH;

                // 4개 꼭짓점에서의 SDF 거리값
                const v0 = this.grid[x][y];     // Bottom-Left
                const v1 = this.grid[x + 1][y]; // Bottom-Right
                const v2 = this.grid[x + 1][y + 1]; // Top-Right
                const v3 = this.grid[x][y + 1]; // Top-Left

                // 각 꼭짓점이 등고선 내부에 있는지 여부 (0: 외부, 1: 내부)
                // SDF 값(최소 거리)이 임계값(오프셋 간격)보다 작으면 내부(1)
                const c0 = v0 < threshold ? 1 : 0;
                const c1 = v1 < threshold ? 1 : 0;
                const c2 = v2 < threshold ? 1 : 0;
                const c3 = v3 < threshold ? 1 : 0;

                // 4비트 상태 인덱스 구성 (0 ~ 15)
                const caseIndex = (c0 << 0) | (c1 << 1) | (c2 << 2) | (c3 << 3);

                if (caseIndex === 0 || caseIndex === 15) continue; // 완전히 안쪽이거나 바깥쪽인 셀

                // 선형 보간 헬퍼
                const lerpX = (val0, val1, xa, xb) => {
                    if (Math.abs(val1 - val0) < 1e-5) return (xa + xb) / 2;
                    return xa + ((threshold - val0) / (val1 - val0)) * (xb - xa);
                };

                const lerpY = (val0, val1, ya, yb) => {
                    if (Math.abs(val1 - val0) < 1e-5) return (ya + yb) / 2;
                    return ya + ((threshold - val0) / (val1 - val0)) * (yb - ya);
                };

                // 각 변(Edge)에서의 보간 점들
                // Edge 0: bottom (v0 to v1) -> (ex0, y0)
                // Edge 1: right (v1 to v2) -> (x1, ey1)
                // Edge 2: top (v3 to v2) -> (ex2, y1)
                // Edge 3: left (v0 to v3) -> (x0, ey3)
                const pEdge0 = () => ({ x: lerpX(v0, v1, x0, x1), y: y0 });
                const pEdge1 = () => ({ x: x1, y: lerpY(v1, v2, y0, y1) });
                const pEdge2 = () => ({ x: lerpX(v3, v2, x0, x1), y: y1 });
                const pEdge3 = () => ({ x: x0, y: lerpY(v0, v3, y0, y1) });

                // 상태 인덱스별 선분 추출
                switch (caseIndex) {
                    case 1:  // v0만 내부
                    case 14: // v0만 외부
                        isolineSegments.push({ p1: pEdge0(), p2: pEdge3() });
                        break;
                    case 2:  // v1만 내부
                    case 13: // v1만 외부
                        isolineSegments.push({ p1: pEdge0(), p2: pEdge1() });
                        break;
                    case 3:  // v0, v1 내부
                    case 12: // v0, v1 외부
                        isolineSegments.push({ p1: pEdge1(), p2: pEdge3() });
                        break;
                    case 4:  // v2만 내부
                    case 11: // v2만 외부
                        isolineSegments.push({ p1: pEdge1(), p2: pEdge2() });
                        break;
                    case 5:  // v0, v2 내부 (대각선 안장점)
                        isolineSegments.push({ p1: pEdge0(), p2: pEdge1() });
                        isolineSegments.push({ p1: pEdge2(), p2: pEdge3() });
                        break;
                    case 6:  // v1, v2 내부
                    case 9:  // v1, v2 외부
                        isolineSegments.push({ p1: pEdge0(), p2: pEdge2() });
                        break;
                    case 7:  // v3만 외부
                    case 8:  // v3만 내부
                        isolineSegments.push({ p1: pEdge2(), p2: pEdge3() });
                        break;
                    case 10: // v0, v2 외부 (대각선 안장점)
                        isolineSegments.push({ p1: pEdge0(), p2: pEdge3() });
                        isolineSegments.push({ p1: pEdge1(), p2: pEdge2() });
                        break;
                }
            }
        }

        return this.chainSegments(isolineSegments);
    }

    // 개별 선분 조각들을 연결하여 긴 경로(Path)들로 합침 (Contour Chaining)
    chainSegments(segments) {
        if (segments.length === 0) return [];

        const paths = [];
        const eps = 0.5; // 동일한 점으로 판정할 오차 임계치 (픽셀 단위)
        const epsSq = eps * eps;

        // 연산 속도를 위해 남은 선분들을 Set 또는 배열로 관리
        // 자바스크립트에서는 순차 탐색이 1000개 정도의 선분 수에서는 아주 빠름
        let remaining = [...segments];

        while (remaining.length > 0) {
            // 새 경로 시작
            const startSeg = remaining.shift();
            const path = [startSeg.p1, startSeg.p2];

            let added = true;
            while (added) {
                added = false;
                const tail = path[path.length - 1];
                const head = path[0];

                for (let i = 0; i < remaining.length; i++) {
                    const seg = remaining[i];
                    
                    // tail에 연결할 수 있는지 검사
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

                    // head에 연결할 수 있는지 검사
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

            // 헤드와 테일이 만나면 닫힌 경로로 설정
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

// 등고선 중복 추출을 방지하기 위해 무게중심 및 시작/끝 대표점 유사성을 기준으로 기하학적 중복 경로를 필터링
function filterDuplicatePaths(paths) {
    const uniquePaths = [];
    const eps = 2.0; // 2px 허용 오차
    const epsSq = eps * eps;

    const getCentroid = (pts) => {
        let sx = 0, sy = 0;
        pts.forEach(p => { sx += p.x; sy += p.y; });
        return { x: sx / pts.length, y: sy / pts.length };
    };

    paths.forEach(path => {
        if (path.points.length < 2) return;

        const c1 = getCentroid(path.points);
        const start1 = path.points[0];
        const end1 = path.points[path.points.length - 1];

        const isDuplicate = uniquePaths.some(saved => {
            const c2 = getCentroid(saved.points);
            
            // 1. 무게중심 거리 검사
            const distCentroid = (c1.x - c2.x)**2 + (c1.y - c2.y)**2;
            if (distCentroid > epsSq) return false;

            // 2. 시작/끝점 비교
            const start2 = saved.points[0];
            const end2 = saved.points[saved.points.length - 1];

            const matchStart = (start1.x - start2.x)**2 + (start1.y - start2.y)**2 < 4;
            const matchEnd = (end1.x - end2.x)**2 + (end1.y - end2.y)**2 < 4;

            return matchStart && matchEnd;
        });

        if (!isDuplicate) {
            uniquePaths.push(path);
        }
    });
    return uniquePaths;
}

// 대지 전체를 채우는 등고선 오프셋 라인을 계산하는 최상위 함수
// width, height: 캔버스 크기
// activeSegments: 선분 데이터
// stepPx: 오프셋 간격(픽셀) - 예: 2.5mm = 10px
export function generateOffsets(width, height, activeSegments, stepPx, gridSize = 300) {
    if (activeSegments.length === 0) return [];

    const df = new DistanceField(width, height, activeSegments, gridSize);
    df.calculate();

    const maxDist = df.maxDistance;
    const paths = [];

    // 0에서 시작하여 최대 대각선 거리까지 stepPx 단위로 등고선 추출
    let distance = stepPx;
    let index = 0;
    while (distance < maxDist) {
        const isolines = df.extractIsoline(distance);
        if (isolines.length === 0) {
            if (distance > maxDist * 0.8) break; 
        }

        const uniqueIsolines = filterDuplicatePaths(isolines);

        uniqueIsolines.forEach(path => {
            paths.push({
                points: path.points,
                isClosed: path.isClosed,
                distance: distance,
                layerIndex: index,
                color: '#e63946' // 기본값, 메인 로직에서 색상 맵핑 변경 가능
            });
        });

        distance += stepPx;
        index++;

        // 브라우저 멈춤 방지를 위한 안전 장치 (최대 150개 라인)
        if (index > 150) break;
    }

    return paths;
}
