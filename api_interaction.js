 // 🔑 Chave da API YouTube Data v3 (e Google Drive)
const API_KEY = "AIzaSyBFDy-3raIsyDOwlu4ynaCLXKGh6_8I46c";
const API_URL = "https://www.googleapis.com/youtube/v3/search";
const DRIVE_FOLDER_ID = "1U2RHZX0W1ZimJQUQ3iVZa-o2UkAx6RKy"; // tua pasta

// Player global
let player = null;
let currentVideoId = null;    // vídeo atualmente a tocar
let queuedVideoId = null;     // vídeo preparado (clicado/selecionado) mas não a tocar
let currentThumbnailUrl = null; // thumbnail da música atual
let currentTitle = null;      // nome da música atualmente a tocar
let currentArtist = null;     // artista da música atualmente a tocar
let isDragging = false;
let isPlaying = false;
let progressInterval = null;
let repeatMode = false;
let autoPlay = true; // flag for auto-play on song click
let previousPage = null; // to track the page before player
let queue = []; // array to hold the queue of songs
let previousSongs = []; // array to hold previous songs for back navigation

// Objeto para guardar estado de cada música

// =============================================================
// YouTube IFrame API loader
// =============================================================
if (!window.YT) {
  const tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  const firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}
function onYouTubeIframeAPIReady() {
  console.log("✅ YT API ready");
}

// =============================================================
// ----------------- YouTube search (mantive a tua) -------------
// =============================================================
async function searchYouTube() {
  const query = document.getElementById("searchInput").value.trim();
  const resultsContainer = document.getElementById("searchResults");
  resultsContainer.innerHTML = "";
  if (!query) return;

  try {
    const response = await fetch(
      `${API_URL}?part=snippet&type=video&maxResults=10&order=relevance&q=${encodeURIComponent(query)}&key=${API_KEY}`
    );
    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      resultsContainer.innerHTML = "<p>Nenhum resultado encontrado.</p>";
      return;
    }

    data.items.forEach((item) => {
      const videoId = item.id.videoId;
      const videoTitle = item.snippet.title;
      const channel = item.snippet.channelTitle;
      const thumbnail = (item.snippet.thumbnails && item.snippet.thumbnails.medium && item.snippet.thumbnails.medium.url) ? item.snippet.thumbnails.medium.url : "";

      const div = document.createElement("div");
      div.classList.add("result-item");
      div.innerHTML = `
        <img src="${thumbnail}" alt="${videoTitle}">
        <div class="result-text">
          <div class="result-title">${videoTitle}</div>
          <div class="result-artist">${channel}</div>
        </div>
        <div class="move-btn" onclick="event.stopPropagation(); moveSong(this);"></div>
        <div class="playlist-btn" style="display: flex; align-items: center; margin-left: auto; margin-right: 5px; width: 20px; height: 20px; background-color: rgb(255,126,0); mask-image: url(playlist.svg); -webkit-mask-image: url(playlist.svg); mask-size: contain; -webkit-mask-size: contain;" onclick="event.stopPropagation(); addToQueue({id:'${videoId}', title:'${escapeHtml(videoTitle)}', artistName:'${escapeHtml(channel)}', thumbnailUrl:'${thumbnail}'}); renderQueue();"></div>
      `;
      div.onclick = () => showVideoInPlayer(videoId, videoTitle, channel, thumbnail, true);
      resultsContainer.appendChild(div);
    });

    // Reset scroll to top after appending results
    resultsContainer.scrollTop = 0;
  } catch (error) {
    console.error("Erro ao pesquisar:", error);
    resultsContainer.innerHTML = "<p>Erro ao carregar resultados.</p>";
  }
}
function clearSearch() { document.getElementById("searchInput").value = ""; document.getElementById("searchResults").innerHTML = ""; }

// =============================================================
// ----------------- Player UI / behaviour ---------------------
// =============================================================
function showVideoInPlayer(id, title, channel, thumbnailUrl, shouldAutoPlay = false) {
  // Add current song to previousSongs if switching
  if (currentVideoId && currentVideoId !== id && currentTitle) {
    previousSongs.push({id: currentVideoId, title: currentTitle, artistName: currentArtist, thumbnailUrl: currentThumbnailUrl});
  }

  if (shouldAutoPlay) {
    // Play without opening player page
    document.getElementById("playerTitle").textContent = title;
    document.getElementById("playerArtist").textContent = channel;
    // atualiza mini-player sempre que abrimos o player
    try { updateMiniPlayer(title, channel, thumbnailUrl); } catch (e) { /* silent */ }

    const progressBar = document.getElementById("progressBar");
    progressBar.value = 0;
    updateProgressBar();

    // Se for nova música, prepara e toca se shouldAutoPlay
    queuedVideoId = id;
    currentVideoId = id;
    currentThumbnailUrl = thumbnailUrl;
    autoPlay = shouldAutoPlay;

    // Se o player ainda não existe, cria
    if (!player) {
      const playerContainer = document.getElementById("videoFrame");
      playerContainer.innerHTML = `
        <iframe id="ytplayer" width="0" height="0"
          src="https://www.youtube.com/embed/${id}?enablejsapi=1&autoplay=0"
          frameborder="0" allow="autoplay"></iframe>
      `;

      const waitForYT = setInterval(() => {
        if (window.YT && YT.Player) {
          clearInterval(waitForYT);
          player = new YT.Player('ytplayer', {
            events: {
              onReady: () => {
                console.log("🎬 Player criado e pronto");
                if (autoPlay) {
                  player.playVideo();
                  autoPlay = false;
                }
                syncUIWithPlayer();
              },
              onStateChange: onPlayerStateChange
            }
          });
        }
      }, 200);
    } else {
      // Player já existe, carrega ou prepara a música
      player.loadVideoById(id);
      player.playVideo();
      syncUIWithPlayer();
    }
    return; // Don't switch pages
  }

  // Original behavior for shouldAutoPlay = false: switch to player page and cue
  previousPage = getCurrentPage(); // Set the previous page before switching
  hideAllPages(); // Hide all pages
  document.getElementById("playerPage").style.display = "block";

  document.getElementById("playerTitle").textContent = title;
  document.getElementById("playerArtist").textContent = channel;
  // atualiza mini-player sempre que abrimos o player
  try { updateMiniPlayer(title, channel, thumbnailUrl); } catch (e) { /* silent */ }

  const progressBar = document.getElementById("progressBar");
  progressBar.value = 0;
  updateProgressBar();

  // Se for nova música, prepara e toca se shouldAutoPlay
  queuedVideoId = id;
  currentVideoId = id;
  currentThumbnailUrl = thumbnailUrl;
  autoPlay = shouldAutoPlay;

  // Se o player ainda não existe, cria
  if (!player) {
    const playerContainer = document.getElementById("videoFrame");
    playerContainer.innerHTML = `
      <iframe id="ytplayer" width="0" height="0"
        src="https://www.youtube.com/embed/${id}?enablejsapi=1&autoplay=0"
        frameborder="0" allow="autoplay"></iframe>
    `;

    const waitForYT = setInterval(() => {
      if (window.YT && YT.Player) {
        clearInterval(waitForYT);
        player = new YT.Player('ytplayer', {
          events: {
            onReady: () => {
              console.log("🎬 Player criado e pronto");
              if (autoPlay) {
                player.playVideo();
                autoPlay = false;
              }
              syncUIWithPlayer();
            },
            onStateChange: onPlayerStateChange
          }
        });
      }
    }, 200);
  } else {
    // Player já existe, carrega ou prepara a música
    if (shouldAutoPlay) {
      player.loadVideoById(id);
      player.playVideo();
    } else {
      player.cueVideoById(id);
      syncUIWithPlayer();
    }
  }
}

// =============================================================
// Player controls / progress bar (mantive lógica principal)
// =============================================================
const progressBar = document.getElementById("progressBar");
function updateProgressBar() {
  if (!progressBar) return;
  const value = Number(progressBar.value) || 0;
  progressBar.style.background = `linear-gradient(to right, rgb(255,126,0) ${value}%, rgb(40,40,40) ${value}%)`;
}
function startProgress() {
  if (progressInterval) return;
  progressInterval = setInterval(() => {
    if (player && !isDragging && typeof player.getCurrentTime === "function") {
      const currentTime = player.getCurrentTime();
      const duration = player.getDuration();
      if (duration > 0) {
        const prog = (currentTime / duration) * 100;
        progressBar.value = prog;
        updateProgressBar();
        if (prog >= 100) {
          if (repeatMode) {
            player.seekTo(0, true);
            player.playVideo();
          } else {
            stopProgress();
            document.getElementById("pause-btn").classList.remove("active");
            isPlaying = false;
          }
        }
      }
    }
  }, 500);
}
function stopProgress() { if (progressInterval) { clearInterval(progressInterval); progressInterval = null; } }

// repeat toggle
const repeatBtn = document.getElementById("repeat-btn");
if (repeatBtn) repeatBtn.addEventListener("click", function () { repeatMode = !repeatMode; this.classList.toggle("active"); });

// function to handle player play/pause based on isPlaying
function togglePlayPause() {
  if (isPlaying) {
    if (player) player.playVideo();
    startProgress();
  } else {
    if (player) player.pauseVideo();
    stopProgress();
  }
}

// play/pause button behaviour
const pauseBtn = document.getElementById("pause-btn");
if (pauseBtn) {
  pauseBtn.addEventListener("click", function () {
    // se não existe player, nada
    if (!player) {
      // visual only: se quiseres preparar sem player, podemos, mas aqui não
      this.classList.toggle("active");
      isPlaying = this.classList.contains("active");
      return;
    }

    // Se houver queuedVideoId diferente do currentVideoId e o user clica em play:
    // interpretamos que o user quer mudar a música para a queued e tocar.
    if (queuedVideoId && queuedVideoId !== currentVideoId) {
      currentVideoId = queuedVideoId;
      try { player.loadVideoById(currentVideoId); } catch (e) { console.warn(e); }
    }

    this.classList.toggle("active");
    isPlaying = this.classList.contains("active");
    if (miniPause) miniPause.classList.toggle('active', isPlaying);
    togglePlayPause();
  });
}

// progress bar drag handlers
if (progressBar) {
  progressBar.addEventListener("mousedown", () => { isDragging = true; stopProgress(); });
  progressBar.addEventListener("mouseup", () => {
    isDragging = false;
    if (player && typeof player.getDuration === "function") {
      const duration = player.getDuration();
      const newTime = (Number(progressBar.value) / 100) * duration;
      player.seekTo(newTime, true);
      if (isPlaying) startProgress();
    }
  });
  progressBar.addEventListener("input", updateProgressBar);
}

// player state change
function onPlayerStateChange(event) {
  const pauseBtnEl = document.getElementById("pause-btn");
  if (event.data === YT.PlayerState.ENDED) {
    if (repeatMode) {
      player.seekTo(0, true);
      player.playVideo();
    } else {
      stopProgress();
      if (pauseBtnEl) pauseBtnEl.classList.remove("active");
      if (miniPause) miniPause.classList.remove('active');
      isPlaying = false;
    }
  } else if (event.data === YT.PlayerState.PLAYING) {
    if (pauseBtnEl) pauseBtnEl.classList.add("active");
    if (miniPause) miniPause.classList.add('active');
    isPlaying = true;
    startProgress();
    // sincroniza currentVideoId com o que está a tocar (por segurança)
    try { currentVideoId = (player && player.getVideoData) ? player.getVideoData().video_id : currentVideoId; } catch (e) { }
  } else if (event.data === YT.PlayerState.PAUSED) {
    if (pauseBtnEl) pauseBtnEl.classList.remove("active");
    if (miniPause) miniPause.classList.remove('active');
    isPlaying = false;
    stopProgress();
  }
}

// sync UI with player (when opening player page)
function syncUIWithPlayer() {
  const pauseBtnEl = document.getElementById("pause-btn");
  if (currentVideoId === queuedVideoId) {
    try {
      const state = player.getPlayerState();
      if (state === YT.PlayerState.PLAYING) {
        if (pauseBtnEl) pauseBtnEl.classList.add("active");
        if (miniPause) miniPause.classList.add('active');
        isPlaying = true;
        startProgress();
      } else {
        pauseBtnEl.classList.remove("active");
        isPlaying = false;
        stopProgress();
      }
    } catch (e) {
      console.warn("syncUIWithPlayer:", e);
    }
  } else {
    // Música diferente: UI reset
    pauseBtnEl.classList.remove("active");
      if (miniPause) miniPause.classList.remove('active');
    isPlaying = false;
    stopProgress();
    const progressBar = document.getElementById("progressBar");
    if (progressBar) {
      progressBar.value = 0;
      updateProgressBar();
    }
  }
}
// =============================================================
// ----------------- Navigation helpers ------------------------
// =============================================================
// helper to hide every main page so we avoid overlap when switching
function hideAllPages() {
  const ids = ['homePage','searchPage','playerPage','songsPage','queuePage','playlistPage','playlistSongsPage'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

// helper to get the currently visible page
function getCurrentPage() {
  const pages = ['homePage','searchPage','playerPage','songsPage','queuePage','playlistPage','playlistSongsPage'];
  for (const p of pages) {
    const el = document.getElementById(p);
    if (el && el.style.display !== 'none') return p;
  }
  return null;
}

const showSearchPage = () => { hideAllPages(); document.getElementById('searchPage').style.display = 'block'; placeMiniPlayer(); };
const showSongsPage = () => { hideAllPages(); document.getElementById('songsPage').style.display = 'block'; loadAllSongs(); placeMiniPlayer(); };
const showQueuePage = () => { hideAllPages(); document.getElementById('queuePage').style.display = 'block'; renderQueue(); placeMiniPlayer(); };
const showPlaylistPage = () => { hideAllPages(); document.getElementById('playlistPage').style.display = 'block'; loadLocalPlaylists(); placeMiniPlayer(); };
const showSearchPagefromPlayerPage = goBackFromPlayer;

// Function to go back from player to the previous page
function goBackFromPlayer() {
  if (previousPage) {
    hideAllPages();
    document.getElementById(previousPage).style.display = 'block';
    // Reset player UI state
    const pb = document.getElementById("pause-btn");
    if (pb) pb.classList.remove("active");
    isPlaying = false;
    stopProgress();
    placeMiniPlayer();
    // Show mini-player again when going back
    const mini = document.querySelector('.mini-player');
    if (mini) mini.style.display = 'block';
    // Reload content if necessary
    if (previousPage === 'songsPage') {
      loadAllSongs();
    } else if (previousPage === 'playlistPage') {
      loadLocalPlaylists();
    } else if (previousPage === 'playlistSongsPage') {
      renderPlaylistSongs(currentPlaylistJson.songs);
    }
  } else {
    // Fallback to search page if no previous page
    showSearchPagefromPlayerPage();
  }
}
const showHomefromSearchPage = () => { hideAllPages(); document.getElementById('homePage').style.display = 'block'; placeMiniPlayer(); };
const showHomefromPlaylistPage = () => { hideAllPages(); document.getElementById('homePage').style.display = 'block'; placeMiniPlayer(); };
const showHomefromSongsPage = () => { hideAllPages(); document.getElementById('homePage').style.display = 'block'; placeMiniPlayer(); };
const showHomefromQueuePage = () => { hideAllPages(); document.getElementById('homePage').style.display = 'block'; placeMiniPlayer(); };
function closePlaylistDetail() { hideAllPages(); document.getElementById('playlistPage').style.display = 'block'; placeMiniPlayer(); }
const showPlaylistPagefromQueuePage = () => { hideAllPages(); document.getElementById('playlistPage').style.display = 'block'; loadLocalPlaylists(); placeMiniPlayer(); };

// Move o mini-player (único elemento) para dentro do watch-frame da página atualmente visível
function placeMiniPlayer() {
  const mini = document.querySelector('.mini-player');
  if (!mini) return;
  const pages = ['homePage','searchPage','playerPage','songsPage','queuePage','playlistPage','playlistSongsPage'];
  for (const pid of pages) {
    const p = document.getElementById(pid);
    if (p && p.style.display !== 'none') {
      const wf = p.querySelector('.watch-frame');
      if (wf) {
        wf.appendChild(mini);
        return;
      }
    }
  }
}

// =============================================================
// ----------------- Google Drive: list + read JSONs ------------
// =============================================================
// Strategy: call Drive API files.list for the folder, then fetch each file content (alt=media)
// NOTE: public folder + API key should allow it. If CORS blocks, podes hospedar os jsons
async function loadLocalPlaylists() {
  const grid = document.getElementById("playlistGrid");
  if (!grid) return;
  grid.innerHTML = `<div style="color:#ddd; text-align:center; padding:12px;">A carregar playlists...</div>`;
  
  try {
    grid.innerHTML = ""; // limpar

    // Lista os ficheiros .json da pasta playlists
    const playlistFiles = ['8D.json', 'chill.json', 'guitar.json', 'minhas musicas.json', 'Motivation.json'];
    console.log(`📁 Encontradas ${playlistFiles.length} playlists na pasta.`);

    // Para cada playlist na pasta
    for (const filename of playlistFiles) {
      const slot = document.createElement("div");
      slot.className = "playlist-item";
      slot.innerHTML = `
        <div class="playlist-thumb" data-loading="true"></div>
        <div class="playlist-name">${escapeHtml(filename.replace('.json', ''))}</div>
      `;
      grid.appendChild(slot);

      // Carregar o conteúdo JSON
      try {
        const resp = await fetch(`playlists/${filename}`);
        if (!resp.ok) {
          console.warn("Não foi possível ler ficheiro:", filename, resp.status);
          const thumb = slot.querySelector(".playlist-thumb");
          if (thumb) thumb.style.background = "#222";
          continue;
        }
        const json = await resp.json();
        // extrai thumbnailUrl do JSON (se existir)
        const thumbUrl = json.thumbnailUrl || null;
        const playlistName = json.name || filename.replace('.json', '');
        slot.querySelector(".playlist-name").textContent = playlistName;

        if (thumbUrl) {
          const img = document.createElement("img");
          img.className = "playlist-thumb";
          img.src = thumbUrl;
          img.alt = playlistName;
          img.loading = "lazy";
          // substitui o placeholder
          const placeholder = slot.querySelector('[data-loading="true"]');
          if (placeholder) {
            placeholder.replaceWith(img);
          }
        } else {
          const placeholder = slot.querySelector('[data-loading="true"]');
          if (placeholder) placeholder.style.background = "#333";
        }

        // guarda o JSON no elemento para usar quando a user clicar
        slot.dataset.fileName = playlistName;
        slot.dataset.json = JSON.stringify(json);

        // click handler: abre detalhe da playlist
        slot.addEventListener("click", () => openPlaylistDetail(slot, json));
      } catch (err) {
        console.error("Erro a ler JSON do ficheiro:", filename, err);
        const placeholder = slot.querySelector('[data-loading="true"]');
        if (placeholder) placeholder.style.background = "#222";
      }
    }
  } catch (err) {
    console.error("Erro ao carregar playlists:", err);
    grid.innerHTML = `<div style="color:#ddd; text-align:center; padding:12px;">Erro ao carregar playlists.</div>`;
  }
}

// helper para escapar HTML pequeno
function escapeHtml(txt) { return String(txt).replace(/[&<>"']/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]); }); }

// =============================================================
// ----------------- Playlist detail (lista de músicas) ---------
// =============================================================
let currentPlaylistJson = null;
let currentPlaylistName = "";

function openPlaylistDetail(slotEl, json) {
  currentPlaylistJson = json;
  currentPlaylistName = slotEl.dataset.fileName || slotEl.dataset.fileName;
  document.getElementById('playlistPage').style.display = 'none';
  document.getElementById('playlistSongsPage').style.display = 'block';
  // atualiza título na página de detalhe/lista de músicas
  const dt = document.getElementById('detailTitle');

  // Define o placeholder da barra de pesquisa com o nome da playlist
  document.getElementById('playlistSearchInput').placeholder = `Pesquisar em ${currentPlaylistName}`;

  // Armazena a playlist atual para uso na pesquisa
  currentPlaylistJson = json;

  renderPlaylistSongs(json.songs);
  // garante que o mini-player fica dentro da página de detalhe da playlist
  try { placeMiniPlayer(); } catch (e) { /* silent */ }
}

function renderPlaylistSongs(songs) {
  const listEl = document.getElementById("playlistSongs");
  listEl.innerHTML = "";
  if (!Array.isArray(songs)) {
    listEl.innerHTML = `<div style="color:#ddd; text-align:center; padding:12px;">Playlist vazia ou inválida.</div>`;
    return;
  }

  const tracks = songs;

  tracks.forEach((track) => {
    const title = track.title || "Unknown";
    const artist = track.artistName || "";
    const vid = track.id;
    const thumbnailUrl = track.thumbnailUrl || `https://img.youtube.com/vi/${vid}/mqdefault.jpg`;

    const item = document.createElement("div");
    item.className = "track-item";
    item.innerHTML = `
      ${thumbnailUrl ? `<img src="${thumbnailUrl}" alt="Thumbnail" style="width: 60px; height: 60px; border-radius: 10px; margin-right: 10px; object-fit: cover;">` : `<div style="width: 60px; height: 60px; border-radius: 10px; margin-right: 10px; background: rgb(71, 71, 71); display: flex; align-items: center; justify-content: center; color: white; font-size: 24px;">♪</div>`}
      <div class="track-text" style="display: flex; flex-direction: column; justify-content: center;">
        <div class="track-title">${escapeHtml(title)}</div>
        <div class="track-artist">${escapeHtml(artist)}</div>
      </div>
      <div class="move-btn" onclick="event.stopPropagation(); moveSong(this);"></div>
      <div class="playlist-btn" onclick="event.stopPropagation(); addToQueue({id:'${vid}', title:'${escapeHtml(title)}', artistName:'${escapeHtml(artist)}', thumbnailUrl:'${thumbnailUrl}'}); renderQueue();"></div>
    `;
    item.onclick = () => showVideoInPlayer(vid, title, artist, thumbnailUrl, true);
    listEl.appendChild(item);
  });
}

// Search functionality for playlist songs
function searchPlaylistSongs() {
  const query = document.getElementById("playlistSearchInput").value.trim().toLowerCase();
  const filteredSongs = currentPlaylistJson.songs.filter(song =>
    song.title.toLowerCase().includes(query) || song.artistName.toLowerCase().includes(query)
  );
  renderPlaylistSongs(filteredSongs);
}

function clearPlaylistSearch() {
  document.getElementById("playlistSearchInput").value = "";
  renderPlaylistSongs(currentPlaylistJson.songs);
}

// Mini Player Controls
const miniPause = document.getElementById('mini-pause');
const miniPrev = document.getElementById('mini-prev');
const miniNext = document.getElementById('mini-next');
const miniPlaylist = document.getElementById('mini-playlist');
const miniPlaylistBtn = document.getElementById('mini-playlist-btn');
const miniTitle = document.querySelector('.mini-title');
const miniArtist = document.querySelector('.mini-artist');

if (miniPause) {
  miniPause.addEventListener('click', function(event) {
    event.stopPropagation();
    this.classList.toggle("active");
    isPlaying = this.classList.contains("active");
    if (pauseBtn) pauseBtn.classList.toggle('active', isPlaying);
    togglePlayPause();
  });
}

if (miniPrev) {
  miniPrev.addEventListener('click', function() {
    if (previousSongs.length > 0) {
      const prevSong = previousSongs.pop();
      showVideoInPlayer(prevSong.id, prevSong.title, prevSong.artistName, prevSong.thumbnailUrl, true);
    } else {
      console.log('No previous track');
    }
  });
}

if (miniNext) {
  miniNext.addEventListener('click', function() {
    if (queue.length > 0) {
      const nextSong = queue.shift();
      showVideoInPlayer(nextSong.id, nextSong.title, nextSong.artistName, nextSong.thumbnailUrl, true);
      renderQueue();
    } else {
      console.log('No next track in queue');
    }
  });
}

if (miniPlaylist) {
  miniPlaylist.addEventListener('click', function() {
    // Abre a página de playlist
    showPlaylistPage();
  });
}

if (miniPlaylistBtn) {
  miniPlaylistBtn.addEventListener('click', function() {
    // Adiciona a música atual à queue
    if (currentVideoId && currentTitle) {
      addToQueue({id: currentVideoId, title: currentTitle, artistName: currentArtist, thumbnailUrl: currentThumbnailUrl});
      renderQueue();
      console.log('Added current song to queue');
    }
  });
}

// Atualiza o mini-player quando uma música é carregada
function updateMiniPlayer(title, artist, thumbnailUrl) {
  currentTitle = title;
  currentArtist = artist;

  if (miniTitle) miniTitle.textContent = title || 'Selecione uma música';
  if (miniArtist) miniArtist.textContent = artist || '';

  // Atualiza a thumbnail do mini-player
  const miniThumb = document.querySelector('.mini-thumb');
  if (miniThumb) {
    if (thumbnailUrl) {
      miniThumb.src = thumbnailUrl;
      miniThumb.style.display = 'block';
    } else {
      miniThumb.style.display = 'none';
    }
  }

  // Sincroniza o estado do botão play/pause
  if (miniPause) {
    miniPause.classList.toggle('active', isPlaying);
  }
}

// Função para mostrar o player page com a música atual
function showPlayerPage() {
  if (getCurrentPage() === 'playerPage') return; // Prevent opening if already on player page

  previousPage = getCurrentPage(); // Set the previous page before switching
  hideAllPages();
  document.getElementById("playerPage").style.display = "block";

  // Define o título e artista da música atual
  document.getElementById("playerTitle").textContent = currentTitle || 'Selecione uma música';
  document.getElementById("playerArtist").textContent = currentArtist || '';

  // Sincroniza a UI do player
  syncUIWithPlayer();

  // Resize player to visible size if it exists
  if (player) {
    const wasPlaying = player.getPlayerState() === YT.PlayerState.PLAYING;
    player.setSize(560, 315);
    // Ensure music continues playing if it was playing before resize
    if (wasPlaying) {
      player.playVideo();
    }
  }

  // Posiciona o mini-player na nova página
  placeMiniPlayer();

  // Esconde o mini-player quando na página do player
  const mini = document.querySelector('.mini-player');
  if (mini) mini.style.display = 'none';
}

// Adiciona o click handler à div mini-thumbnail
const miniThumbnail = document.querySelector('.mini-thumbnail');
if (miniThumbnail) {
  miniThumbnail.addEventListener('click', showPlayerPage);
}
// =============================================================
// ----------------- Load all songs for songs page --------------
// =============================================================
async function loadAllSongs() {
  const songListEl = document.getElementById("songList");
  if (!songListEl) return;
  songListEl.innerHTML = `<div style="color:#ddd; text-align:center; padding:12px;">A carregar músicas...</div>`;

  try {
    const playlistFiles = ['8D.json', 'chill.json', 'guitar.json', 'minhas musicas.json', 'Motivation.json'];
    const allSongs = new Map(); // Use Map to aggregate unique by id

    for (const filename of playlistFiles) {
      try {
        const resp = await fetch(`playlists/${filename}`);
        if (!resp.ok) continue;
        const json = await resp.json();
        if (json.songs && Array.isArray(json.songs)) {
          json.songs.forEach(song => {
            if (song.id && song.title) {
              allSongs.set(song.id, song); // Unique by id
            }
          });
        }
      } catch (err) {
        console.warn("Erro ao carregar playlist:", filename, err);
      }
    }

    songListEl.innerHTML = ""; // Clear loading

    if (allSongs.size === 0) {
      songListEl.innerHTML = `<div style="color:#ddd; text-align:center; padding:12px;">Nenhuma música encontrada.</div>`;
      return;
    }

    Array.from(allSongs.values()).forEach(song => {
      const title = song.title || "Unknown";
      const artist = song.artistName || "";
      const vid = song.id;

      const thumbnailUrl = song.thumbnailUrl || `https://img.youtube.com/vi/${vid}/mqdefault.jpg`;
      const item = document.createElement("div");
      item.className = "song-item";
      item.innerHTML = `
        ${thumbnailUrl ? `<img src="${thumbnailUrl}" alt="Thumbnail" style="width: 60px; height: 60px; border-radius: 10px; margin-right: 10px; object-fit: cover;">` : `<div style="width: 60px; height: 60px; border-radius: 10px; margin-right: 10px; background: rgb(71, 71, 71); display: flex; align-items: center; justify-content: center; color: white; font-size: 24px;">♪</div>`}
        <div class="song-text" style="display: flex; flex-direction: column; justify-content: center;">
          <div class="song-title">${escapeHtml(title)}</div>
          <div class="song-artist">${escapeHtml(artist)}</div>
        </div>
        <div class="move-btn" onclick="event.stopPropagation(); moveSong(this);"></div>
        <div class="playlist-btn" style="display: flex; align-items: center; margin-left: auto; margin-right: 5px; width: 20px; height: 20px; background-color: rgb(255,126,0); mask-image: url(playlist.svg); -webkit-mask-image: url(playlist.svg); mask-size: contain; -webkit-mask-size: contain;" onclick="event.stopPropagation(); addToQueue({id:'${vid}', title:'${escapeHtml(title)}', artistName:'${escapeHtml(artist)}', thumbnailUrl:'${thumbnailUrl}'}); renderQueue();"></div>
      `;
      item.onclick = () => showVideoInPlayer(vid, title, artist, thumbnailUrl, true);
      songListEl.appendChild(item);
    });

    console.log(`📄 Carregadas ${allSongs.size} músicas únicas.`);
  } catch (err) {
    console.error("Erro ao carregar músicas:", err);
    songListEl.innerHTML = `<div style="color:#ddd; text-align:center; padding:12px;">Erro ao carregar músicas.</div>`;
  }
}

// =============================================================
// ----------------- Queue functionality ------------------------
// =============================================================
function addToQueue(song) {
  if (!queue.find(s => s.id === song.id)) {
    queue.push(song);
    console.log("Added to queue:", song.title);
  } else {
    console.log("Song already in queue:", song.title);
  }
}

function removeFromQueue(index) {
  if (index >= 0 && index < queue.length) {
    const removed = queue.splice(index, 1);
    console.log("Removed from queue:", removed[0].title);
    renderQueue();
  }
}

function renderQueue() {
  const queueListEl = document.getElementById("queueList");
  if (!queueListEl) return;
  queueListEl.innerHTML = "";

  if (queue.length === 0) {
    queueListEl.innerHTML = `<div style="color:#ddd; text-align:center; padding:12px;">Queue vazia.</div>`;
    return;
  }

  queue.forEach((song, index) => {
    const title = song.title || "Unknown";
    const artist = song.artistName || "";
    const vid = song.id;
    const thumbnailUrl = song.thumbnailUrl || `https://img.youtube.com/vi/${vid}/mqdefault.jpg`;

    const item = document.createElement("div");
    item.className = "result-item";
    item.innerHTML = `
      <img src="${thumbnailUrl}" alt="${title}">
      <div class="result-text" style="margin-left: 5px;">
        <div class="result-title">${escapeHtml(title)}</div>
        <div class="result-artist">${escapeHtml(artist)}</div>
      </div>
      <div class="move-icon" draggable="true" ondragstart="dragStart(event, ${index})" ondragover="dragOver(event)" ondrop="drop(event, ${index})"></div>
      <div class="remove-icon" onclick="removeFromQueue(${index})"></div>
    `;
    item.onclick = () => showVideoInPlayer(vid, title, artist, thumbnailUrl, true);
    queueListEl.appendChild(item);
  });
}

function searchQueueSongs() {
  const query = document.getElementById("queueSearchInput").value.trim().toLowerCase();
  const filteredQueue = queue.filter(song =>
    song.title.toLowerCase().includes(query) || song.artistName.toLowerCase().includes(query)
  );
  renderFilteredQueue(filteredQueue);
}

function clearQueueSearch() {
  document.getElementById("queueSearchInput").value = "";
  renderQueue();
}

function renderFilteredQueue(filteredSongs) {
  const queueListEl = document.getElementById("queueList");
  if (!queueListEl) return;
  queueListEl.innerHTML = "";

  if (filteredSongs.length === 0) {
    queueListEl.innerHTML = `<div style="color:#ddd; text-align:center; padding:12px;">Nenhuma música encontrada.</div>`;
    return;
  }

  filteredSongs.forEach((song, index) => {
    const title = song.title || "Unknown";
    const artist = song.artistName || "";
    const vid = song.id;
    const thumbnailUrl = song.thumbnailUrl || `https://img.youtube.com/vi/${vid}/mqdefault.jpg`;

    const item = document.createElement("div");
    item.className = "result-item";
    item.innerHTML = `
      <img src="${thumbnailUrl}" alt="${title}">
      <div class="result-text" style="margin-left: 5px;">
        <div class="result-title">${escapeHtml(title)}</div>
        <div class="result-artist">${escapeHtml(artist)}</div>
      </div>
      <div class="move-icon" draggable="true" ondragstart="dragStart(event, ${index})" ondragover="dragOver(event)" ondrop="drop(event, ${index})"></div>
      <div class="remove-icon" onclick="removeFromQueue(${index})"></div>
    `;
    item.onclick = () => showVideoInPlayer(vid, title, artist, thumbnailUrl, true);
    queueListEl.appendChild(item);
  });
}

// Drag and drop functions for queue reordering
let draggedIndex = null;

function dragStart(event, index) {
  draggedIndex = index;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/html', event.target.outerHTML);
  event.target.style.opacity = '0.5';
}

function dragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
}

function drop(event, dropIndex) {
  event.preventDefault();
  if (draggedIndex === null || draggedIndex === dropIndex) return;

  // Reorder the queue array
  const draggedSong = queue.splice(draggedIndex, 1)[0];
  queue.splice(dropIndex, 0, draggedSong);

  // Re-render the queue
  renderQueue();

  draggedIndex = null;
}

// Carregar as playlists ao abrir a página
loadLocalPlaylists();
// posiciona o mini-player dentro do watch-frame visível
placeMiniPlayer();
