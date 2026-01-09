const CONFIG = {
    PLAYLIST_STORAGE_KEY: "music_player_playlist",
    PLAY_HISTORY_STORAGE_KEY: "music_player_play_history",
    MAX_HISTORY_COUNT: 50,
    API_BASE_URL: "https://yy.330115558.xyz",
    CACHE_CONFIG: {
        capacity: 1000,
        expire: {
            url: 10 * 60 * 1000, 
            other: 60 * 60 * 1000 
        }
    }
};
let searchInput, searchBtn;
let searchTab, collectTab, historyTab, searchContent, collectContent, historyContent;
let searchEmpty, collectEmpty, historyEmpty, clearHistoryBtn;
let playerTitle, playerAuthor, lyricContainer, lyricWrapper, playPauseBtn, prevBtn, nextBtn;
let progressContainer, progressBar, currentTimeEl, totalTimeEl, bgCover;
let playAllBtn, confirmModal, confirmDesc, volumeSlider;
let searchSongList = [];
let playlist = [];
let playHistory = [];
let currentSearchIndex = -1;
let currentPlaylistIndex = -1;
let activeListType = 'collect';
let audio = new Audio();
let lyricLines = [];
let cacheMap = new Map();
let playAllIndex = 0;
let confirmCallback = null;
const LYRIC_LINE_HEIGHT = 40;
const SHOW_LINE_COUNT = 8;
const ACTIVE_LINE_INDEX = 3;

// 播放记忆核心状态
let playbackMemory = {
    currentSong: null,
    currentListType: null,
    currentIndex: -1
};
const SONG_NAME_SUFFIX = " ▶";

// DOM加载完成初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// 二次确认弹窗核心函数
function showConfirmModal(desc, callback) {
    confirmDesc.textContent = desc || '你确定要执行此操作吗？';
    confirmCallback = callback;
    confirmModal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function hideConfirmModal() {
    confirmModal.classList.remove('active');
    document.body.style.overflow = '';
    confirmCallback = null;
}

function executeConfirmCallback() {
    if (typeof confirmCallback === 'function') {
        confirmCallback();
    }
    hideConfirmModal();
}

// 核心功能函数
function playAllSongs() {
    try {
        if (playlist.length === 0) {
            showErrorTip("歌单暂无歌曲");
            return;
        }
        playAllIndex = 0;
        activeListType = 'collect';
        currentPlaylistIndex = 0;
        playbackMemory.currentListType = 'collectContent';
        playbackMemory.currentIndex = 0;
        playbackMemory.currentSong = playlist[0];
        playSongByPlaylistIndex(0, true);
        audio.removeEventListener('ended', playNextInAll);
        audio.addEventListener('ended', playNextInAll);
        renderAllSongLists();
        console.log('一键播放功能执行成功');
    } catch (err) {
        console.error('一键播放报错:', err);
        showErrorTip("一键播放失败，请重试");
    }
}

function clearPlayHistory() {
    try {
        if (playHistory.length === 0) {
            showErrorTip("暂无播放记录可清空");
            return;
        }
        playHistory = [];
        savePlayHistoryToLocal();
        renderPlayHistory();
        if (playbackMemory.currentListType === 'historyContent') {
            playbackMemory.currentSong = null;
            playbackMemory.currentListType = null;
            playbackMemory.currentIndex = -1;
        }
        showErrorTip("播放记录已清空");
        console.log('清除记录功能执行成功');
    } catch (err) {
        console.error('清除记录报错:', err);
        showErrorTip("清除记录失败，请重试");
    }
}

function togglePlayPause() {
    try {
        if (audio.paused) {
            if (!playbackMemory.currentSong) {
                if ((activeListType === 'search' && searchSongList.length > 0)) {
                    playListSong('searchContent', 0);
                } else if ((activeListType === 'collect' && playlist.length > 0)) {
                    playListSong('collectContent', 0);
                } else if ((activeListType === 'history' && playHistory.length > 0)) {
                    playListSong('historyContent', 0);
                }
            } else {
                audio.play().catch(err => {
                    showErrorTip(`播放失败: ${err.message}`);
                });
                playPauseBtn.textContent = "❚❚";
            }
        } else {
            audio.pause();
            playPauseBtn.textContent = "▶";
        }
    } catch (err) {
        console.error('播放暂停报错:', err);
    }
}

function playNextInAll() {
    playAllIndex++;
    if (playAllIndex >= playlist.length) {
        audio.pause();
        playPauseBtn.textContent = "▶";
        audio.removeEventListener('ended', playNextInAll);
        playAllIndex = 0;
        currentPlaylistIndex = -1;
        playbackMemory.currentIndex = -1;
        playbackMemory.currentSong = null;
        renderAllSongLists();
        return;
    }
    currentPlaylistIndex = playAllIndex;
    playbackMemory.currentIndex = playAllIndex;
    playbackMemory.currentSong = playlist[playAllIndex];
    playSongByPlaylistIndex(playAllIndex, true);
    renderAllSongLists();
}

function playSongByPlaylistIndex(index, isPlayAll = false) {
    const song = playlist[index];
    if (!song) {
        showErrorTip("歌曲不存在");
        return;
    }
    const urlParams = new URLSearchParams(song.url.split('?')[1]);
    const songId = urlParams.get('id');
    if (!songId) {
        showErrorTip("歌曲信息解析失败");
        return;
    }
    playerTitle.textContent = song.title;
    playerAuthor.textContent = song.author;

    addToPlayHistory(song);

    getSongResource(songId, 'url').then(songUrl => {
        if (songUrl === '#') {
            showErrorTip("获取播放链接失败");
            return;
        }
        audio.src = songUrl;
        audio.play().then(() => {
            playPauseBtn.textContent = "❚❚";
        }).catch(err => {
            showErrorTip(`播放失败: ${err.message}`);
        });
    });

    getSongResource(songId, 'lrc').then(lrcUrl => {
        if (lrcUrl !== '#') {
            fetch(lrcUrl, { mode: 'cors', timeout: 5000 })
                .then(res => res.text())
                .then(lrcText => {
                    lyricLines = parseLrc(lrcText);
                    renderLyric();
                })
                .catch(() => {
                    lyricLines = [];
                    renderLyric();
                });
        } else {
            lyricLines = [];
            renderLyric();
        }
    });

    getSongResource(songId, 'pic').then(coverUrl => {
        setBgCover(coverUrl);
        const coverImg = document.getElementById(`cover_collectContent_${index}`);
        if (coverImg) coverImg.src = coverUrl;
        song.cover = coverUrl;
        savePlaylistToLocal();
    });

    if (!isPlayAll) {
        audio.removeEventListener('ended', playNextInAll);
    }
}

function playSongByHistoryIndex(index) {
    const song = playHistory[index];
    if (!song) {
        showErrorTip("播放记录不存在");
        return;
    }
    const urlParams = new URLSearchParams(song.url.split('?')[1]);
    const songId = urlParams.get('id');
    if (!songId) {
        showErrorTip("歌曲信息解析失败");
        return;
    }

    playerTitle.textContent = song.title;
    playerAuthor.textContent = song.author;

    addToPlayHistory(song);

    getSongResource(songId, 'url').then(songUrl => {
        if (songUrl === '#') {
            showErrorTip("获取播放链接失败");
            return;
        }
        audio.src = songUrl;
        audio.play().then(() => {
            playPauseBtn.textContent = "❚❚";
        }).catch(err => {
            showErrorTip(`播放失败: ${err.message}`);
        });
    });

    getSongResource(songId, 'lrc').then(lrcUrl => {
        if (lrcUrl !== '#') {
            fetch(lrcUrl, { mode: 'cors', timeout: 5000 })
                .then(res => res.text())
                .then(lrcText => {
                    lyricLines = parseLrc(lrcText);
                    renderLyric();
                })
                .catch(() => {
                    lyricLines = [];
                    renderLyric();
                });
        } else {
            lyricLines = [];
            renderLyric();
        }
    });

    getSongResource(songId, 'pic').then(coverUrl => {
        setBgCover(coverUrl);
        const coverImg = document.getElementById(`cover_historyContent_${index}`);
        if (coverImg) coverImg.src = coverUrl;
        song.cover = coverUrl;
        savePlayHistoryToLocal();
    });
}

function deleteSongFromPlaylist(index) {
    showConfirmModal("确定要从歌单中删除这首歌曲吗？", () => {
        try {
            const deletedSong = playlist[index];
            playlist.splice(index, 1);
            savePlaylistToLocal();
            renderSongList(playlist, collectContent, collectEmpty);

            if (playbackMemory.currentListType === 'collectContent' && playbackMemory.currentIndex === index) {
                playbackMemory.currentSong = null;
                playbackMemory.currentIndex = -1;
                if (playlist.length === 0) {
                    audio.pause();
                    playerTitle.textContent = "未播放歌曲";
                    playerAuthor.textContent = "点击歌曲开始播放";
                    lyricLines = [];
                    renderLyric();
                    setBgCover("https://picsum.photos/1920/1080");
                } else if (playbackMemory.currentIndex >= playlist.length) {
                    playbackMemory.currentIndex = playlist.length - 1;
                    playbackMemory.currentSong = playlist[playlist.length - 1];
                }
            }
            renderAllSongLists();
        } catch (err) {
            console.error('删除歌曲报错:', err);
            showErrorTip("删除歌曲失败，请重试");
        }
    });
}

function deleteHistoryItem(index) {
    const deletedSong = playHistory[index];
    playHistory.splice(index, 1);
    savePlayHistoryToLocal();
    renderPlayHistory();

    if (playbackMemory.currentListType === 'historyContent' && playbackMemory.currentIndex === index) {
        playbackMemory.currentSong = null;
        playbackMemory.currentIndex = -1;
        if (playHistory.length === 0) {
            audio.pause();
            playerTitle.textContent = "未播放歌曲";
            playerAuthor.textContent = "点击歌曲开始播放";
        } else if (playbackMemory.currentIndex >= playHistory.length) {
            playbackMemory.currentIndex = playHistory.length - 1;
            playbackMemory.currentSong = playHistory[playHistory.length - 1];
        }
    }
    renderAllSongLists();
}

// 音量调节函数
function initVolumeControl() {
    const savedVolume = localStorage.getItem('music_player_volume');
    const initialVolume = savedVolume ? parseFloat(savedVolume) : 0.7;
    audio.volume = initialVolume;
    volumeSlider.value = initialVolume;

    volumeSlider.addEventListener('input', (e) => {
        const volume = parseFloat(e.target.value);
        audio.volume = volume;
        localStorage.setItem('music_player_volume', volume);
        document.querySelector('.volume-icon').textContent = volume > 0.5 ? '🔊' : volume > 0 ? '🔉' : '🔇';
    });
}

// 统一初始化函数
function initApp() {
    try {
        console.log('=== 应用开始初始化 ===');
        initDOM();
        bindEvents();
        loadDataFromLocal();
        initVolumeControl();
        renderSongList(playlist, collectContent, collectEmpty);
        renderPlayHistory();
        setBgCover("https://picsum.photos/1920/1080");
        initAutoPlayNext();
        console.log('=== 应用初始化完成 ===');
    } catch (err) {
        console.error('应用初始化报错:', err);
        showErrorTip("应用加载失败，请刷新页面重试");
    }
}

// DOM初始化
function initDOM() {
    try {
        console.log('=== 开始初始化DOM元素 ===');
        clearHistoryBtn = document.getElementById('clearHistoryBtn');
        playAllBtn = document.getElementById('playAllBtn');
        volumeSlider = document.getElementById('volumeSlider');
        confirmModal = document.getElementById('confirmModal');
        confirmDesc = document.getElementById('confirmDesc');

        searchInput = document.getElementById('searchInput');
        searchBtn = document.getElementById('searchBtn');
        searchTab = document.getElementById('searchTab');
        collectTab = document.getElementById('collectTab');
        historyTab = document.getElementById('historyTab');
        searchContent = document.getElementById('searchContent');
        collectContent = document.getElementById('collectContent');
        historyContent = document.getElementById('historyContent');
        searchEmpty = document.getElementById('searchEmpty');
        collectEmpty = document.getElementById('collectEmpty');
        historyEmpty = document.getElementById('historyEmpty');

        playerTitle = document.getElementById('playerTitle');
        playerAuthor = document.getElementById('playerAuthor');
        lyricContainer = document.getElementById('lyricContainer');
        lyricWrapper = document.getElementById('lyricWrapper');
        playPauseBtn = document.getElementById('playPauseBtn');
        prevBtn = document.getElementById('prevBtn');
        nextBtn = document.getElementById('nextBtn');
        progressContainer = document.getElementById('progressContainer');
        progressBar = document.getElementById('progressBar');
        currentTimeEl = document.getElementById('currentTime');
        totalTimeEl = document.getElementById('totalTime');
        bgCover = document.getElementById('bgCover');

        console.log('=== DOM元素初始化完成 ===');
    } catch (err) {
        console.error('DOM初始化报错:', err);
        throw err;
    }
}

// 事件绑定
function bindEvents() {
    try {
        console.log('=== 开始绑定事件 ===');

        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', () => {
                showConfirmModal('确定要清空所有播放记录吗？此操作不可恢复', clearPlayHistory);
            });
            console.log('底部清除记录按钮事件绑定成功');
        } else {
            console.warn('底部清除记录按钮DOM未找到，仅依赖onclick兜底');
        }

        if (playAllBtn) {
            playAllBtn.addEventListener('click', playAllSongs);
            console.log('一键播放按钮事件绑定成功');
        } else {
            console.warn('一键播放按钮DOM未找到，仅依赖onclick兜底');
        }

        searchBtn.addEventListener('click', () => {
            const keyword = searchInput.value.trim();
            if (keyword) {
                const cacheKey = `search_netease_${keyword}`;
                cacheMap.delete(cacheKey);
            }
            searchSongs();
        });

        searchInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                const keyword = searchInput.value.trim();
                if (keyword) {
                    const cacheKey = `search_netease_${keyword}`;
                    cacheMap.delete(cacheKey);
                }
                searchSongs();
            }
        });
// 标签切换 - 新增头部栏显示/隐藏逻辑
searchTab.addEventListener('click', () => {
    searchTab.classList.add('active');
    collectTab.classList.remove('active');
    historyTab.classList.remove('active');
    searchContent.classList.add('active');
    collectContent.classList.remove('active');
    historyContent.classList.remove('active');
    // 隐藏歌单/历史记录头部栏
    document.getElementById('playlistBar').style.display = 'none';
    document.getElementById('historyBar').style.display = 'none';
    activeListType = 'search';
    currentPlaylistIndex = -1;
    currentSearchIndex = -1;
    renderAllSongLists();
});

collectTab.addEventListener('click', () => {
    collectTab.classList.add('active');
    searchTab.classList.remove('active');
    historyTab.classList.remove('active');
    collectContent.classList.add('active');
    searchContent.classList.remove('active');
    historyContent.classList.remove('active');
    // 显示歌单头部栏，隐藏历史记录头部栏
    document.getElementById('playlistBar').style.display = 'flex';
    document.getElementById('historyBar').style.display = 'none';
    activeListType = 'collect';
    currentSearchIndex = -1;
    renderAllSongLists();
});

historyTab.addEventListener('click', () => {
    historyTab.classList.add('active');
    searchTab.classList.remove('active');
    collectTab.classList.remove('active');
    historyContent.classList.add('active');
    searchContent.classList.remove('active');
    collectContent.classList.remove('active');
    // 显示历史记录头部栏，隐藏歌单头部栏
    document.getElementById('playlistBar').style.display = 'none';
    document.getElementById('historyBar').style.display = 'flex';
    activeListType = 'history';
    currentSearchIndex = -1;
    currentPlaylistIndex = -1;
    renderPlayHistory();
    renderAllSongLists();
});
        // 标签切换
       /* searchTab.addEventListener('click', () => {
            searchTab.classList.add('active');
            collectTab.classList.remove('active');
            historyTab.classList.remove('active');
            searchContent.classList.add('active');
            collectContent.classList.remove('active');
            historyContent.classList.remove('active');
            activeListType = 'search';
            currentPlaylistIndex = -1;
            currentSearchIndex = -1;
            renderAllSongLists();
        });

        collectTab.addEventListener('click', () => {
            collectTab.classList.add('active');
            searchTab.classList.remove('active');
            historyTab.classList.remove('active');
            collectContent.classList.add('active');
            searchContent.classList.remove('active');
            historyContent.classList.remove('active');
            activeListType = 'collect';
            currentSearchIndex = -1;
            renderAllSongLists();
        });

        historyTab.addEventListener('click', () => {
            historyTab.classList.add('active');
            searchTab.classList.remove('active');
            collectTab.classList.remove('active');
            historyContent.classList.add('active');
            searchContent.classList.remove('active');
            collectContent.classList.remove('active');
            activeListType = 'history';
            currentSearchIndex = -1;
            currentPlaylistIndex = -1;
            renderPlayHistory();
            renderAllSongLists();
        });*/

        // 上一曲/下一曲
        prevBtn.addEventListener('click', () => {
            if (!playbackMemory.currentSong) return;
            let prevIndex = playbackMemory.currentIndex - 1;
            if (prevIndex >= 0) {
                playListSong(playbackMemory.currentListType, prevIndex);
            }
        });

        nextBtn.addEventListener('click', () => {
            if (!playbackMemory.currentSong) return;
            let nextIndex = playbackMemory.currentIndex + 1;
            const listLength = {
                'searchContent': searchSongList.length,
                'collectContent': playlist.length,
                'historyContent': playHistory.length
            }[playbackMemory.currentListType];
            if (nextIndex < listLength) {
                playListSong(playbackMemory.currentListType, nextIndex);
            }
        });

        // 进度条控制
        progressContainer.addEventListener('click', e => {
            if (!audio.duration) return;
            const progress = e.offsetX / progressContainer.offsetWidth;
            audio.currentTime = progress * audio.duration;
            progressBar.style.width = `${progress * 100}%`;
        });

        // 播放进度更新
        audio.addEventListener('timeupdate', () => {
            const progress = audio.currentTime / audio.duration * 100;
            progressBar.style.width = `${isNaN(progress) ? 0 : progress}%`;
            currentTimeEl.textContent = formatTime(audio.currentTime);
            renderLyric();
        });

        // 音频错误处理
        audio.addEventListener('error', (err) => {
            showErrorTip(`音频加载失败: ${err.target.error.message}`);
        });

        console.log('=== 事件绑定完成 ===');
    } catch (err) {
        console.error('事件绑定报错:', err);
        throw err;
    }
}

// 播放记忆相关核心函数
function playListSong(listType, index) {
    playbackMemory.currentListType = listType;
    playbackMemory.currentIndex = index;

    let song = null;
    if (listType === 'searchContent') {
        activeListType = 'search';
        song = searchSongList[index];
        playbackMemory.currentSong = song;
        playSongBySearchIndex(index);
    } else if (listType === 'collectContent') {
        activeListType = 'collect';
        song = playlist[index];
        playbackMemory.currentSong = song;
        playSongByPlaylistIndex(index);
    } else if (listType === 'historyContent') {
        activeListType = 'history';
        song = playHistory[index];
        playbackMemory.currentSong = song;
        playSongByHistoryIndex(index);
    }
    renderAllSongLists();
}

function renderAllSongLists() {
    renderSongList(searchSongList, searchContent, searchEmpty);
    renderSongList(playlist, collectContent, collectEmpty);
    renderPlayHistory();
}

// 歌名差异化格式化（蓝色系）
// 歌名差异化格式化（仅保留播放中标记，移除跨列表来源标记）
function formatSongName(song, listType) {
    if (!playbackMemory.currentSong) return song.title;

    // 是否为当前播放歌曲
    const isCurrentPlaying = song.url === playbackMemory.currentSong.url;

    let formattedName = song.title;
    // 仅保留播放中歌曲的蓝色▶后缀，移除所有[xxx]标记
    if (isCurrentPlaying) formattedName += " <span style='color: #0066ff; font-weight: bold;'>▶</span>";
    
    return formattedName;

//function formatSongName(song, listType) {
//    if (!playbackMemory.currentSong) return song.title;

 //   const isCurrentPlaying = song.url === playbackMemory.currentSong.url;
//    const isCrossList = listType !== playbackMemory.currentListType;

   // let formattedName = song.title;
    // 播放中歌曲添加蓝色后缀
   // if (isCurrentPlaying) formattedName += " <span style='color: #0066ff; font-weight: bold;'>▶</span>";
    // 跨列表显示添加蓝色来源标记
    if (isCrossList) {
        let listName = "";
        switch(playbackMemory.currentListType) {
            case 'searchContent': listName = "搜索结果"; break;
            case 'collectContent': listName = "我的歌单"; break;
            case 'historyContent': listName = "播放记录"; break;
        }
        formattedName += ` <span style='color: #0099ff; font-size: 14px;'>[${listName}]</span>`;
    }
    return formattedName;
}

// 其他工具函数
function loadDataFromLocal() {
    try {
        const localPlaylist = localStorage.getItem(CONFIG.PLAYLIST_STORAGE_KEY);
        playlist = localPlaylist ? JSON.parse(localPlaylist) : [];

        const localPlayHistory = localStorage.getItem(CONFIG.PLAY_HISTORY_STORAGE_KEY);
        playHistory = localPlayHistory ? JSON.parse(localPlayHistory) : [];
    } catch (err) {
        console.error('加载本地数据报错:', err);
        playlist = [];
        playHistory = [];
        showErrorTip("本地数据加载失败，已重置");
    }
}

function savePlaylistToLocal() {
    localStorage.setItem(CONFIG.PLAYLIST_STORAGE_KEY, JSON.stringify(playlist));
}

function savePlayHistoryToLocal() {
    playHistory = playHistory.slice(0, CONFIG.MAX_HISTORY_COUNT);
    localStorage.setItem(CONFIG.PLAY_HISTORY_STORAGE_KEY, JSON.stringify(playHistory));
}

function addToPlayHistory(song) {
    if (!song || !song.url) return;

    playHistory = playHistory.filter(item => item.url !== song.url);

    const historyItem = {
        ...song,
        playTime: new Date().toLocaleString()
    };

    playHistory.unshift(historyItem);

    if (playHistory.length > CONFIG.MAX_HISTORY_COUNT) {
        playHistory = playHistory.slice(0, CONFIG.MAX_HISTORY_COUNT);
    }

    savePlayHistoryToLocal();

    if (activeListType === 'history') {
        renderPlayHistory();
    }
}

function renderPlayHistory() {
    if (playHistory.length === 0) {
        historyEmpty.style.display = "block";
        historyContent.innerHTML = "";
        return;
    }

    historyEmpty.style.display = "none";
    historyContent.innerHTML = playHistory.map((song, index) => {
        const urlParams = new URLSearchParams(song.url.split('?')[1]);
        const songId = urlParams.get('id');

        return `
        <div class="song-item" data-index="${index}" data-songid="${songId}">
            <img src="${song.cover || `https://picsum.photos/100/100?random=${Math.random()}`}" alt="封面" class="song-cover" id="cover_historyContent_${index}" loading="lazy">
            <div class="song-info">
                <div class="song-title">${formatSongName(song, 'historyContent')}</div>
                <div class="song-author">${song.author}</div>
                <div class="song-time">播放时间：${song.playTime}</div>
            </div>
            <div class="song-opt">
                <button class="opt-btn play" onclick="playListSong('historyContent', ${index})">▶</button>
                <button class="opt-btn delete" onclick="deleteHistoryItem(${index})">✕</button>
            </div>
        </div>
    `}).join('');

    const loadCoversInBatches = async (batchSize = 5) => {
        for (let i = 0; i < playHistory.length; i += batchSize) {
            const batch = playHistory.slice(i, i + batchSize);
            await Promise.all(batch.map(async (song, batchIndex) => {
                const index = i + batchIndex;
                const urlParams = new URLSearchParams(song.url.split('?')[1]);
                const songId = urlParams.get('id');
                const coverUrl = await getSongResource(songId, 'pic');
                const coverImg = document.getElementById(`cover_historyContent_${index}`);
                if (coverImg) coverImg.src = coverUrl;
                playHistory[index].cover = coverUrl;
            }));
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        savePlayHistoryToLocal();
    };
    loadCoversInBatches();
}

function setBgCover(coverUrl) {
    bgCover.style.backgroundImage = `url(${coverUrl || "https://picsum.photos/1920/1080"})`;
}

async function getSongResource(songId, type) {
    const server = "netease";
    const cacheKey = `${type}_${server}_${songId}`;
    const cacheData = getCache(cacheKey);
    if (cacheData) return cacheData;
    const requestUrl = `${CONFIG.API_BASE_URL}?server=${server}&type=${type}&id=${songId}`;
    try {
        const res = await fetch(requestUrl, {
            method: "GET",
            redirect: "follow",
            mode: 'cors',
            credentials: 'omit',
            timeout: 10000
        });
        if (!res.ok) throw new Error(`状态码: ${res.status}`);
        const resourceUrl = res.url;
        setCache(cacheKey, resourceUrl, type === 'url' || type === 'pic');
        return resourceUrl;
    } catch (err) {
        console.error(`获取${type}失败:`, err);
        try {
            const res = await fetch(requestUrl, {
                method: "GET",
                redirect: "follow",
                mode: 'cors',
                credentials: 'omit'
            });
            if (res.ok) {
                const resourceUrl = res.url;
                setCache(cacheKey, resourceUrl, type === 'url' || type === 'pic');
                return resourceUrl;
            }
        } catch (retryErr) {
            console.error(`重试获取${type}失败:`, retryErr);
        }
        return type === 'pic' ? "https://picsum.photos/100/100?random=" + Math.random() : "#";
    }
}

function initAutoPlayNext() {
    audio.addEventListener('ended', () => {
        if (playAllIndex > 0 && playAllIndex < playlist.length) {
            playNextInAll();
        } else {
            let nextIndex = -1;
            let nextListType = playbackMemory.currentListType;
            if (nextListType === 'searchContent') {
                nextIndex = playbackMemory.currentIndex + 1;
                if (nextIndex < searchSongList.length) {
                    playListSong('searchContent', nextIndex);
                }
            } else if (nextListType === 'collectContent') {
                nextIndex = playbackMemory.currentIndex + 1;
                if (nextIndex < playlist.length) {
                    playListSong('collectContent', nextIndex);
                }
            } else if (nextListType === 'historyContent') {
                nextIndex = playbackMemory.currentIndex + 1;
                if (nextIndex < playHistory.length) {
                    playListSong('historyContent', nextIndex);
                }
            } else {
                audio.pause();
                playPauseBtn.textContent = "▶";
                if (nextListType === 'searchContent') {
                    currentSearchIndex = -1;
                } else if (nextListType === 'collectContent') {
                    currentPlaylistIndex = -1;
                } else if (nextListType === 'historyContent') {
                    currentSearchIndex = -1;
                }
                playAllIndex = 0;
            }
        }
        renderAllSongLists();
    });
}

function formatTime(seconds) {
    if (isNaN(seconds)) return "00:00";
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function showErrorTip(msg) {
    const tip = document.createElement('div');
    tip.className = 'error-tip';
    tip.textContent = msg;
    if (activeListType === 'search') {
        searchContent.appendChild(tip);
    } else if (activeListType === 'collect') {
        collectContent.appendChild(tip);
    } else if (activeListType === 'history') {
        historyContent.appendChild(tip);
    }
    setTimeout(() => tip.remove(), 3000);
}

function getCache(key) {
    const cacheData = cacheMap.get(key);
    if (!cacheData) return null;
    if (Date.now() - cacheData.time > cacheData.expire) {
        cacheMap.delete(key);
        return null;
    }
    const cacheTip = document.createElement('div');
    cacheTip.className = 'cache-tip';
    cacheTip.textContent = '缓存命中';
    searchContent.appendChild(cacheTip);
    setTimeout(() => cacheTip.remove(), 2000);
    return cacheData.data;
}

function setCache(key, data, isUrl = false) {
    if (cacheMap.size >= CONFIG.CACHE_CONFIG.capacity) {
        const firstKey = cacheMap.keys().next().value;
        cacheMap.delete(firstKey);
    }
    cacheMap.set(key, {
        data,
        time: Date.now(),
        expire: isUrl ? CONFIG.CACHE_CONFIG.expire.url : CONFIG.CACHE_CONFIG.expire.other
    });
    const cacheTip = document.createElement('div');
    cacheTip.className = 'cache-tip';
    cacheTip.textContent = '缓存未命中，调用上游API';
    searchContent.appendChild(cacheTip);
    setTimeout(() => cacheTip.remove(), 2000);
}

function parseLrc(lrcText) {
    const lines = lrcText.split('\n');
    const result = [];
    const lrcRegex = /\[(\d{2}):(\d{2})\.(\d{3})\](.*)/;
    lines.forEach(line => {
        const match = line.match(lrcRegex);
        if (match) {
            const time = parseInt(match[1]) * 60 + parseFloat(`${match[2]}.${match[3]}`);
            const text = match[4].trim();
            if (text) result.push({ time, text });
        }
    });
    return result;
}

function renderLyric() {
    if (!lyricWrapper || lyricLines.length === 0) {
        lyricWrapper.innerHTML = '<div class="lyric-line">暂无歌词</div>';
        return;
    }
    const currentTime = audio.currentTime;
    let activeIndex = 0;
    for (let i = 0; i < lyricLines.length; i++) {
        if (lyricLines[i].time <= currentTime) {
            activeIndex = i;
        } else {
            break;
        }
    }
    const lyricHtml = lyricLines.map((line, index) => `
        <div class="lyric-line ${index === activeIndex ? 'active' : ''}">${line.text}</div>
    `).join('');
    lyricWrapper.innerHTML = lyricHtml;
    const scrollY = (activeIndex - ACTIVE_LINE_INDEX) * LYRIC_LINE_HEIGHT;
    const maxScrollY = Math.max(0, (lyricLines.length - SHOW_LINE_COUNT) * LYRIC_LINE_HEIGHT);
    const finalScrollY = Math.min(Math.max(0, scrollY), maxScrollY);
    lyricWrapper.style.transform = `translateY(-${finalScrollY}px)`;
}

function renderSongList(songs, container, emptyEl) {
    if (!container || !emptyEl) return;
    if (songs.length === 0) {
        emptyEl.style.display = "block";
        container.innerHTML = "";
        return;
    }
    emptyEl.style.display = "none";

    const isPlaylist = container.id === 'collectContent';
    container.innerHTML = songs.map((song, index) => {
        const urlParams = new URLSearchParams(song.url.split('?')[1]);
        const songId = urlParams.get('id');
        const isCollected = playlist.some(item => item.url === song.url);

        return `
        <div class="song-item" data-index="${index}" data-songid="${songId}">
            <img src="https://picsum.photos/100/100?random=${Math.random()}" alt="封面" class="song-cover" id="cover_${container.id}_${index}" loading="lazy">
            <div class="song-info">
                <div class="song-title">${formatSongName(song, container.id)}</div>
                <div class="song-author">${song.author}</div>
            </div>
            <div class="song-opt">
                <button class="opt-btn play" onclick="playListSong('${container.id}', ${index})">▶</button>
                ${!isPlaylist ? `<button class="opt-btn collect ${isCollected ? 'active' : ''}" onclick="toggleCollect(${index})">${isCollected ? '♥' : '♡'}</button>` : ''}
                ${isPlaylist ? `<button class="opt-btn delete" onclick="deleteSongFromPlaylist(${index})">✕</button>` : ''}
            </div>
        </div>
    `}).join('');

    const loadCoversInBatches = async (songs, containerId, batchSize = 5) => {
        for (let i = 0; i < songs.length; i += batchSize) {
            const batch = songs.slice(i, i + batchSize);
            await Promise.all(batch.map(async (song, batchIndex) => {
                const index = i + batchIndex;
                const urlParams = new URLSearchParams(song.url.split('?')[1]);
                const songId = urlParams.get('id');
                const coverUrl = await getSongResource(songId, 'pic');
                const coverImg = document.getElementById(`cover_${containerId}_${index}`);
                if (coverImg) coverImg.src = coverUrl;
            }));
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    };
    loadCoversInBatches(songs, container.id);
}

async function playSongBySearchIndex(index) {
    if (index < 0 || index >= searchSongList.length) {
        showErrorTip("歌曲索引无效");
        return;
    }
    const song = searchSongList[index];
    if (!song || !song.url) {
        showErrorTip("歌曲信息不完整");
        return;
    }
    const urlParams = new URLSearchParams(song.url.split('?')[1]);
    const songId = urlParams.get('id');
    if (!songId) {
        showErrorTip("歌曲信息解析失败");
        return;
    }

    currentSearchIndex = index;
    playerTitle.textContent = song.title;
    playerAuthor.textContent = song.author;

    addToPlayHistory(song);

    try {
        const songUrl = await getSongResource(songId, 'url');
        if (songUrl === '#') {
            showErrorTip("获取播放链接失败");
            return;
        }
        audio.src = songUrl;

        const coverUrl = await getSongResource(songId, 'pic');
        setBgCover(coverUrl);
        const coverImg = document.getElementById(`cover_searchContent_${index}`);
        if (coverImg) coverImg.src = coverUrl;
        song.cover = coverUrl;

        const lrcUrl = await getSongResource(songId, 'lrc');
        if (lrcUrl !== '#') {
            const lrcText = await fetch(lrcUrl, { mode: 'cors', timeout: 5000 }).then(res => res.text());
            lyricLines = parseLrc(lrcText);
            renderLyric();
        } else {
            lyricLines = [];
            renderLyric();
        }

        await audio.play();
        playPauseBtn.textContent = "❚❚";
        audio.onloadedmetadata = () => {
            totalTimeEl.textContent = formatTime(audio.duration);
        };
    } catch (err) {
        console.error("播放搜索结果失败:", err);
        showErrorTip(`播放失败：${err.message}`);
    }
}

async function searchSongs() {
    const server = "netease";
    const keyword = searchInput.value.trim();
    if (!keyword) return alert("请输入搜索关键词");

    const requestUrl = `${CONFIG.API_BASE_URL}?server=${server}&type=search&id=${encodeURIComponent(keyword)}`;
    const cacheKey = `search_${server}_${keyword}`;
    const cacheData = getCache(cacheKey);

    if (cacheData) {
        searchSongList = cacheData;
        renderSongList(cacheData, searchContent, searchEmpty);
        return;
    }

    try {
        const res = await fetch(requestUrl, {
            method: "GET",
            redirect: "follow",
            cache: "no-store",
            mode: 'cors',
            credentials: 'omit',
            headers: {
                "Accept": "application/json",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache"
            },
            timeout: 15000
        });

        if (!res.ok) {
            throw new Error(`HTTP错误，状态码: ${res.status}`);
        }

        const responseText = await res.text();
        let songs;
        try {
            songs = JSON.parse(responseText);
        } catch (parseErr) {
            throw new Error(`响应解析失败: ${parseErr.message}`);
        }

        const validSongs = songs.filter(song => {
            try {
                const urlParams = new URLSearchParams(song.url.split('?')[1]);
                return !!urlParams.get('id');
            } catch (err) {
                return false;
            }
        });

        searchSongList = validSongs;
        setCache(cacheKey, validSongs);
        renderSongList(validSongs, searchContent, searchEmpty);
    } catch (err) {
        console.error("搜索失败:", err);
        showErrorTip(`搜索失败：${err.message}`);
        renderSongList([], searchContent, searchEmpty);
    }
}

function toggleCollect(index) {
    if (activeListType !== 'search' || index < 0 || index >= searchSongList.length) {
        showErrorTip("操作无效");
        return;
    }
    const song = searchSongList[index];
    const existIndex = playlist.findIndex(item => item.url === song.url);

    if (existIndex > -1) {
        playlist.splice(existIndex, 1);
        showErrorTip("已从歌单移除");
    } else {
        playlist.push(song);
        showErrorTip("已添加到歌单");
    }

    savePlaylistToLocal();
    renderSongList(searchSongList, searchContent, searchEmpty);
    renderSongList(playlist, collectContent, collectEmpty);
}

// 全局函数暴露
window.toggleCollect = toggleCollect;
window.deleteSongFromPlaylist = deleteSongFromPlaylist;
window.deleteHistoryItem = deleteHistoryItem;
window.playSongByPlaylistIndex = playSongByPlaylistIndex;
window.playSongBySearchIndex = playSongBySearchIndex;
window.playSongByHistoryIndex = playSongByHistoryIndex;
window.playListSong = playListSong;
window.playAllSongs = playAllSongs;
window.clearPlayHistory = clearPlayHistory;
window.togglePlayPause = togglePlayPause;
window.showConfirmModal = showConfirmModal;
window.hideConfirmModal = hideConfirmModal;
window.executeConfirmCallback = executeConfirmCallback;
