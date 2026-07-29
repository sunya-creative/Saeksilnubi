// main.js - UI 제어 및 애플리케이션 핵심 통합 스크립트

import { CanvasManager } from './canvas.js';
import { generateOffsets } from './offset.js';

// 전통 한국 색상 팔레트 (색실누비에 어울리는 감각적인 웜/파스텔/오방 톤 조합)
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
    // 1. CanvasManager 인스턴스 생성
    const manager = new CanvasManager('drawing-canvas', 'canvas-container');

    // 2. UI 엘리먼트 가져오기
    const canvasWidthInput = document.getElementById('canvas-width');
    const canvasHeightInput = document.getElementById('canvas-height');
    const canvasBgColorInput = document.getElementById('canvas-bg-color');
    const bgColorPreview = document.getElementById('bg-color-preview');
    const bgColorText = document.getElementById('bg-color-text');

    const toolPencil = document.getElementById('tool-pencil');
    const toolLine = document.getElementById('tool-line');
    const toolEraser = document.getElementById('tool-eraser');
    const toolClear = document.getElementById('tool-clear');

    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');

    const symmetryEnable = document.getElementById('symmetry-enable');
    const symmetryCount = document.getElementById('symmetry-count');
    const symmetryCountVal = document.getElementById('symmetry-count-val');
    const symmetryCountWrapper = document.getElementById('symmetry-count-wrapper');

    const offsetStepInput = document.getElementById('offset-step');
    const dashLengthInput = document.getElementById('dash-length');
    const dashGapInput = document.getElementById('dash-gap');

    const btnGenerateOffset = document.getElementById('btn-generate-offset');
    const layerListContainer = document.getElementById('layer-list-container');
    const loadingOverlay = document.getElementById('loading-overlay');

    const btnColorAll = document.getElementById('btn-color-all');
    const btnColorRainbow = document.getElementById('btn-color-rainbow');
    const btnColorRandom = document.getElementById('btn-color-random');

    const btnExportSvg = document.getElementById('btn-export-svg');
    const btnExportPng = document.getElementById('btn-export-png');

    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const btnZoomReset = document.getElementById('btn-zoom-reset');
    const zoomLevelVal = document.getElementById('zoom-level');

    const themeBtn = document.getElementById('theme-btn');
    const leftSidebar = document.getElementById('left-sidebar');
    const rightSidebar = document.getElementById('right-sidebar');
    const mobileLeftToggle = document.getElementById('mobile-left-toggle');
    const mobileRightToggle = document.getElementById('mobile-right-toggle');

    // 3. UI 초기 설정 적용
    let currentZoom = 1.0;
    
    // 테마 설정 (로컬 스토리지 또는 OS 선호)
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    themeBtn.addEventListener('click', () => {
        const nextTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nextTheme);
        localStorage.setItem('theme', nextTheme);
    });

    // 모바일 사이드바 토글
    mobileLeftToggle.addEventListener('click', () => {
        leftSidebar.classList.toggle('active');
        rightSidebar.classList.remove('active');
    });

    mobileRightToggle.addEventListener('click', () => {
        rightSidebar.classList.toggle('active');
        leftSidebar.classList.remove('active');
    });

    // 4. 대지 설정 핸들러
    function updateCanvasSize() {
        const w = parseInt(canvasWidthInput.value) || 20;
        const h = parseInt(canvasHeightInput.value) || 20;
        manager.setDimensions(w, h);
        fitCanvasToScreen();
    }

    canvasWidthInput.addEventListener('change', updateCanvasSize);
    canvasHeightInput.addEventListener('change', updateCanvasSize);

    // 대지 배경색 피커 연동
    canvasBgColorInput.addEventListener('input', (e) => {
        const color = e.target.value;
        bgColorPreview.style.backgroundColor = color;
        bgColorText.innerText = color.toUpperCase();
        manager.setBackgroundColor(color);
    });

    // 5. 드로잉 도구 선택 핸들러
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
        manager.redo();
    });

    // 대칭 드로잉 설정 핸들러
    function updateSymmetryConfig() {
        const isEnabled = symmetryEnable.checked;
        const count = parseInt(symmetryCount.value);
        
        symmetryCountVal.innerText = count;
        symmetryCountWrapper.style.opacity = isEnabled ? '1' : '0.5';
        symmetryCount.disabled = !isEnabled;

        manager.setSymmetry(isEnabled, count);
    }

    symmetryEnable.addEventListener('change', updateSymmetryConfig);
    symmetryCount.addEventListener('input', updateSymmetryConfig);
    
    // 초기 대칭 뷰 업데이트
    updateSymmetryConfig();

    // 6. 오프셋 설정 및 대시선 실시간 반영
    function updateDashStyle() {
        manager.dashLength = parseInt(dashLengthInput.value) || 4;
        manager.dashGap = parseInt(dashGapInput.value) || 3;
        manager.render();
    }

    dashLengthInput.addEventListener('change', updateDashStyle);
    dashGapInput.addEventListener('change', updateDashStyle);

    // 7. 오프셋 도안 생성 핵심 로직
    btnGenerateOffset.addEventListener('click', () => {
        const activeSegments = manager.getActiveSegments();
        
        if (activeSegments.length === 0) {
            alert('도안을 생성하려면 먼저 캔버스에 선을 그려주세요!');
            return;
        }

        // 로딩 바 활성화
        loadingOverlay.style.display = 'flex';

        // 계산을 메인 이벤트 루프에서 양보하여 스피너가 돌 수 있도록 처리
        setTimeout(() => {
            try {
                const canvasW = manager.canvas.width;
                const canvasH = manager.canvas.height;
                
                // mm 단위를 픽셀 단위로 변환
                // 1cm = 40px -> 1mm = 4px
                const stepMm = parseFloat(offsetStepInput.value) || 2.5;
                const stepPx = stepMm * 4;

                // 2.5mm 오프셋 등고선 생성 계산 수행
                // 대지 해상도에 맞춰 그리드를 300~400 수준으로 설정하여 연산 속도와 정밀도 최적화
                const generatedPaths = generateOffsets(canvasW, canvasH, activeSegments, stepPx, 300);
                
                // 기본 오프셋 선 색상을 메인 스케치 선 색상과 다른 적색 톤으로 채우거나 유지
                generatedPaths.forEach(path => {
                    path.color = '#9e2a2b'; // 기본 적색
                });

                manager.offsetPaths = generatedPaths;
                manager.render();

                // 사이드바 레이어 목록 갱신
                updateLayerListUI();
            } catch (err) {
                console.error(err);
                alert('도안 생성 중 오류가 발생했습니다. 선의 양이 너무 많거나 계산 범위가 초과되었을 수 있습니다.');
            } finally {
                loadingOverlay.style.display = 'none';
                
                // 모바일 환경일 경우 결과물을 잘 보여주기 위해 우측 사이드바 자동 오픈
                if (window.innerWidth < 768) {
                    rightSidebar.classList.add('active');
                }
            }
        }, 50);
    });

    // 8. 개별 라인별 컬러 관리 UI 렌더러
    function updateLayerListUI() {
        layerListContainer.innerHTML = '';

        if (!manager.offsetPaths || manager.offsetPaths.length === 0) {
            return;
        }

        // 거리별(layerIndex별) 그룹화
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
            // 실제 mm 변환 값 표시 (1px = 0.25mm)
            const distMm = (layer.distance * 0.25).toFixed(1);
            const defaultColor = layer.paths[0].color || '#9e2a2b';

            const item = document.createElement('div');
            item.className = 'layer-item';
            item.innerHTML = `
                <div class="layer-info">
                    <span style="font-weight: 500;">단계 ${layer.index + 1}</span>
                    <span style="color: var(--text-secondary); font-size: 0.75rem;">(${distMm}mm 외곽)</span>
                </div>
                <div class="color-picker-wrapper">
                    <div class="layer-color-dot" style="background-color: ${defaultColor};">
                        <input type="color" class="layer-color-picker" value="${defaultColor}" data-index="${layer.index}">
                    </div>
                    <span style="font-size: 0.75rem; font-family: monospace;">${defaultColor.toUpperCase()}</span>
                </div>
            `;

            // 개별 레이어 컬러 변경 시 실시간 반영 이벤트
            const colorPicker = item.querySelector('.layer-color-picker');
            const colorDot = item.querySelector('.layer-color-dot');
            const colorText = item.querySelector('span:last-child');

            colorPicker.addEventListener('input', (e) => {
                const color = e.target.value;
                colorDot.style.backgroundColor = color;
                colorText.innerText = color.toUpperCase();
                
                // 해당 layerIndex를 가지는 모든 패스의 컬러 변경
                manager.offsetPaths.forEach(path => {
                    if (path.layerIndex === layer.index) {
                        path.color = color;
                    }
                });
                manager.render();
            });

            layerListContainer.appendChild(item);
        });
    }

    // 9. 일괄 배색 변경 기능
    // 일괄 단색 변경
    btnColorAll.addEventListener('click', () => {
        if (manager.offsetPaths.length === 0) return;
        const targetColor = prompt('모든 선에 적용할 HEX 컬러 코드를 입력하세요:', '#9e2a2b');
        if (!targetColor || !/^#[0-9A-F]{6}$/i.test(targetColor)) {
            if (targetColor) alert('유효한 HEX 코드를 입력해주세요. (예: #9E2A2B)');
            return;
        }

        manager.offsetPaths.forEach(path => {
            path.color = targetColor;
        });
        manager.render();
        updateLayerListUI();
    });

    // 그라데이션 자동 배색
    btnColorRainbow.addEventListener('click', () => {
        if (manager.offsetPaths.length === 0) return;
        
        // 최대 레이어 개수 파악
        const maxLayer = Math.max(...manager.offsetPaths.map(p => p.layerIndex)) + 1;

        manager.offsetPaths.forEach(path => {
            // 그라데이션 색상 매핑
            // HSL 색상 모델을 활용해 부드럽게 무지개/그라데이션 색 생성
            const hue = (path.layerIndex / maxLayer) * 360;
            path.color = `hsl(${hue}, 70%, 45%)`;
        });
        manager.render();
        updateLayerListUI();
    });

    // 전통 팔레트 기반 랜덤 배색
    btnColorRandom.addEventListener('click', () => {
        if (manager.offsetPaths.length === 0) return;

        const maxLayer = Math.max(...manager.offsetPaths.map(p => p.layerIndex)) + 1;
        const selectedColors = [];
        
        // 레이어 단계마다 랜덤 컬러 지정
        for (let i = 0; i < maxLayer; i++) {
            const randColor = TRADITIONAL_PALETTE[Math.floor(Math.random() * TRADITIONAL_PALETTE.length)];
            selectedColors.push(randColor);
        }

        manager.offsetPaths.forEach(path => {
            path.color = selectedColors[path.layerIndex];
        });
        manager.render();
        updateLayerListUI();
    });

    // 10. 줌 및 화면 맞춤 제어
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
        const workspaceW = manager.container.parentElement.clientWidth - 80; // 패딩 여유
        const workspaceH = manager.container.parentElement.clientHeight - 80;
        const canvasW = manager.widthCm * manager.pixelScale;
        const canvasH = manager.heightCm * manager.pixelScale;

        const scaleW = workspaceW / canvasW;
        const scaleH = workspaceH / canvasH;
        const optimalZoom = Math.min(scaleW, scaleH, 1.2); // 최대 120%까지만 맞춤

        setZoomValue(optimalZoom);
    }

    // 창 크기 변경 시 자동 맞춤
    window.addEventListener('resize', () => {
        // 모바일 화면 크기가 아닐 때만 리사이즈 시 화면 맞춤 자동 조정
        if (window.innerWidth > 768) {
            fitCanvasToScreen();
        }
    });

    // 11. 내보내기 기능 개발
    // SVG 고해상도 내보내기 (실측 mm 매핑 적용)
    btnExportSvg.addEventListener('click', () => {
        if (!manager.offsetPaths || manager.offsetPaths.length === 0) {
            alert('내보낼 오프셋 도안이 없습니다. 도안을 먼저 생성해주세요!');
            return;
        }

        const wCm = manager.widthCm;
        const hCm = manager.heightCm;
        const wPx = wCm * manager.pixelScale;
        const hPx = hCm * manager.pixelScale;

        // SVG 명세 생성: width, height에 실제 mm단위를 부여하여 인쇄 시 크기가 일치하게 지정
        let svgStr = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n`;
        svgStr += `<svg width="${wCm * 10}mm" height="${hCm * 10}mm" viewBox="0 0 ${wPx} ${hPx}" xmlns="http://www.w3.org/2000/svg">\n`;
        
        // 대지 배경색 사각형 추가
        svgStr += `  <rect width="100%" height="100%" fill="${manager.bgColor}" />\n`;

        // 모든 오프셋 라인들을 SVG 패스로 변환
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

            svgStr += `  <path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${dashStyle}" id="offset-layer-${path.layerIndex}-path-${idx}" />\n`;
        });

        svgStr += `</svg>`;

        // SVG 다운로드 실행
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

    // PNG 내보내기
    btnExportPng.addEventListener('click', () => {
        // 임시 링크 생성 후 캔버스 DataURL로 다이렉트 다운로드
        const link = document.createElement('a');
        link.download = `saeksilnubi_pattern_${manager.widthCm}x${manager.heightCm}.png`;
        
        // 줌 레벨에 상관없이 본래 해상도로 PNG 렌더링하기 위해 강제 리렌더링
        manager.render();
        
        link.href = manager.canvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // 초기 실행 화면 핏팅
    setTimeout(fitCanvasToScreen, 100);
});
