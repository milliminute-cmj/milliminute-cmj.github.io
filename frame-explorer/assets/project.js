var wait = false, translation = {
    selected: {
        en_us: { text: "selected:", title: "" },
        en_uk: { text: "selected:", title: "" },
        fr: { text: "éléments selectionnés :", title: "" }
    },
    import: {
        en_us: { text: "import", title: "import file. supported formats: video/*" },
        en_uk: { text: "import", title: "import file. supported formats: video/*" },
        fr: { text: "importer", title: "importer des fichiers du format : video/*" }
    },
    remove: {
        en_us: { text: "remove", title: "remove video from the current selection" },
        en_uk: { text: "remove", title: "remove video from the current selection" },
        fr: { text: "supprimer", title: "supprime la sélection actuel." }
    },
    savedLangs: ["en_us", "en_uk", "fr"],
    currentLang: "en_us",
    translateToLang: function (lang) {
        if (translation.savedLangs.includes(lang)) {
            translation.currentLang = lang;
            translation.push();
        }
    },
    push: function () {}
};

(function (win) {
    var a = null, b = null, c = document.head.appendChild(document.createElement("style"));

    function appendErrorOption(selectEl, errorMessage) {
        var opt = document.createElement("option");
        opt.value = "error";
        opt.setAttribute("size", "0");
        opt.setAttribute("last-modified", "0");
        opt.setAttribute("file-type", "video/mp4");
        opt.disabled = true;
        opt.className = "error";
        opt.textContent = errorMessage;
        selectEl.appendChild(opt);
    }

    function validFile(files) {
        var selectEl = document.querySelector("#loadedFiles");
        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            try {
                if (file.size === 0) {
                    throw new Error("File is empty: " + file.name);
                } else {
                    var opt = document.createElement("option");
                    var objectUrl = URL.createObjectURL(file);
                    opt.value = objectUrl;
                    opt.setAttribute("size", file.size);
                    opt.setAttribute("last-modified", file.lastModified);
                    opt.setAttribute("file-type", file.type);
                    opt.setAttribute("file-template-url", objectUrl);
                    opt.textContent = file.name;
                    selectEl.appendChild(opt);
                }
            } catch (importError) {
                appendErrorOption(selectEl, importError.message || importError);
            }
        }
    }

    function openVideo(url, time) {
        wait = true;
        document.querySelector("#load").hidden = true;

        var videoNode = document.querySelector("video");
        var appNode = document.querySelector("#app");

        videoNode.src = url;

        // Événement déclenché quand la première image de la vidéo est prête
        videoNode.onloadeddata = function () {
            videoNode.currentTime = time || 0;
            document.querySelector('input[type="range"]').max = document.querySelector('video').duration;
            appNode.hidden = false; // Afficher l'application
            wait = false;
            };
    }

    /**
     * Avance ou recule la vidéo d'une frame exacte.
     * @param {HTMLVideoElement} video - L'élément vidéo HTML.
     * @param {number} direction - 1 pour avancer d'une frame, -1 pour reculer.
     * @param {number} fps - Nombre d'images par seconde de la vidéo (ex: 25, 30, 29.97).
     */
    function stepFrame(video, direction, fps) {
        // 1. Définir le FPS par défaut si non renseigné (standard web courant : 25 ou 30)
        var frameRate = fps || 25;
        var frameDuration = 1 / frameRate;

        // 2. S'assurer que la vidéo est en pause sur Android 4 avant de chercher une frame
        if (!video.paused) {
                video.pause();
        }

        // 3. Vérifier que les métadonnées et données de la vidéo sont prêtes
        if (video.readyState < 2) {
                // HAVE_CURRENT_DATA (2) est le minimum requis pour modifier currentTime
                return;
        }

        // 4. Test de fonctionnalité avec typeof (Compatibilité Android 4 / anciens navigateurs)
        if (direction > 0 && typeof video.seekToNextFrame !== "undefined") {
                // Si le navigateur supporte l'API expérimentale native (avancer uniquement)
                try {
                        video.seekToNextFrame();
                        document.querySelector('input[type="range"]').value = document.querySelector('video').currentTime;
                } catch (e) {
                        // Fallback en cas d'erreur du lecteur natif
                        fallbackSeek(video, direction, frameDuration);
                }
        } else {
                // Méthode universelle par calcul temporel
                fallbackSeek(video, direction, frameDuration);
        }
    }

    /**
     * Calcul manuel du temps et mise à jour de currentTime
     */
    function fallbackSeek(video, direction, frameDuration) {
        // Calcul de la nouvelle position temporelle
        var targetTime = video.currentTime + (direction * frameDuration);

        // Ajustement fin pour éviter les erreurs d'arrondi de flottants
        // Ajout d'une fraction de milliseconde (0.00001s) pour forcer le décodeur à passer le seuil de la frame
        if (direction > 0) {
                targetTime += 0.00001;
        }

        // Bornage entre 0 et la durée maximale de la vidéo
        if (targetTime < 0) {
                targetTime = 0;
        } else if (targetTime > video.duration) {
                targetTime = video.duration;
        }

        // Application du nouveau temps
        video.currentTime = targetTime;
        document.querySelector('input[type="range"]').value = document.querySelector('video').currentTime;
    }

    // Verrou global pour empêcher la surcharge du décodeur Android 4
    var isSeeking = false;

    /**
     * Recule la vidéo d'une frame exacte.
     * @param {HTMLVideoElement} videoNode - L'élément <video>
     * @param {number} fps - Nombre d'images par seconde (ex: 25, 30)
     */
    function stepBackward(videoNode, fps) {
        // 1. Si le décodeur est déjà en train de chercher une frame, on ignore la demande
        if (isSeeking || videoNode.seeking) {
                return;
        }

        // 2. Définition du FPS et de la durée d'une frame
        var frameRate = fps || 25;
        var frameDuration = 1 / frameRate;

        // 3. Pause obligatoire sur Android 4 avant toute manipulation temporelle
        if (!videoNode.paused) {
                videoNode.pause();
        }

        // 4. Vérification du niveau de chargement du buffer
        if (videoNode.readyState < 2) {
                return;
        }

        // 5. Test de présence d'une méthode native expérimentale avec typeof
        if (typeof videoNode.seekToPreviousFrame !== "undefined") {
                try {
                        // Dans le cas théorique où un navigateur ancien implémenterait l'API
                        videoNode.seekToPreviousFrame();
                } catch (e) {
                        executeManualStepBackward(videoNode, frameDuration);
                }
        } else {
                // Fallback universel : calcul temporel manuel avec offset négatif
                executeManualStepBackward(videoNode, frameDuration);
        }
    }

    /**
     * Effectue le calcul et applique le saut temporel arrière
     */
    function executeManualStepBackward(videoNode, frameDuration) {
        isSeeking = true;

        // Calcul du temps cible : temps actuel MOINS la durée d'une frame
        var targetTime = videoNode.currentTime - frameDuration;

        // CORRECTION CRITIQUE POUR ANDROID 4 :
        // On soustrait une micro-fraction supplémentaire (0.0001s ou 100 microsecondes)
        // pour s'assurer de franchir la frontière temporelle (PTS) de l'image précédente.
        targetTime -= 0.0001;

        // Sécurité : Ne pas descendre en dessous de zéro
        if (targetTime < 0) {
                targetTime = 0;
        }

        // Gestion de la fin de recherche d'image via l'événement 'seeked'
        var onSeekEnd = function () {
                // Suppression de l'événement pour éviter les fuites mémoire sous Android 4
                videoNode.removeEventListener("seeked", onSeekEnd, false);
                isSeeking = false;
        };

        // Attachement de l'écouteur d'événement
        videoNode.addEventListener("seeked", onSeekEnd, false);

        // Application du nouveau temps au décodeur
        videoNode.currentTime = targetTime;
        document.querySelector('input[type="range"]').value = document.querySelector('video').currentTime;
    }

    /**
     * Effectue la capture de l'image courante de la vidéo et la sauvegarde en PNG.
     * @param {HTMLVideoElement} videoNode - L'élément <video>
     */
    function captureFrameToPng(videoNode) {
        // 1. Contrôle de sécurité : vérification du chargement de la vidéo
        if (!videoNode || videoNode.readyState < 2) {
            alert("La vidéo n'est pas prête pour la capture.");
            return;
        }

        // 2. Récupération des dimensions réelles du flux vidéo (résolution native)
        // On privilégie videoWidth/videoHeight aux dimensions d'affichage (clientWidth)
        var width = videoNode.videoWidth || videoNode.clientWidth;
        var height = videoNode.videoHeight || videoNode.clientHeight;
    
        if (width === 0 || height === 0) {
            alert("Impossible de déterminer les dimensions de la vidéo.");
            return;
        }

        // 3. Instanciation dynamique d'un canvas en mémoire
        var canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        var ctx = canvas.getContext("2d");

        // 4. Copie du buffer vidéo sur le contexte 2D du canvas
        try {
            ctx.drawImage(videoNode, 0, 0, width, height);
        } catch (e) {
            // Gestion de l'erreur CORS si la vidéo est sur un serveur distant
            alert("Erreur de capture : Sécurité CORS (Tainted Canvas).");
            return;
        }
    
        // 5. Export de l'image au format PNG
        var pngDataUrl;
        try {
            pngDataUrl = canvas.toDataURL("image/png");
        } catch (e) {
            alert("Erreur lors de la conversion en PNG.");
            return;
        }
    
        // 6. Procédure de sauvegarde selon les capacités du navigateur
        savePngFile(pngDataUrl);
    
        // 7. Nettoyage de la mémoire (indispensable sur la mémoire RAM limitée d'Android 4)
        canvas.width = 0;
        canvas.height = 0;
        canvas = null;
    }

    /**
     * Gère le téléchargement ou l'affichage de l'image selon la compatibilité navigateur.
     * @param {string} dataUrl - L'image encodée en base64 (data:image/png;base64,...)
     */
    function savePngFile(dataUrl) {
        var a = document.createElement("a");
        var filename = "frame_" + new Date().getTime() + ".png";

        // Test de présence de l'attribut HTML5 'download' (typeof check)
        if (typeof a.download !== "undefined") {
                // Méthode moderne (Chrome, Firefox, Android 5+)
                a.href = dataUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
        } else {
                // Contournement spécifique Android 4 (WebKit natif) :
                // L'attribut 'download' n'existe pas. On injecte une balise <img>
                // pour permettre à l'utilisateur de faire un appui long -> "Enregistrer l'image".
                
                var imgPreview = document.querySelector("#capturePreview");
                
                if (!imgPreview) {
                        imgPreview = document.createElement("img");
                        imgPreview.id = "capturePreview";
                        imgPreview.style.display = "block";
                        imgPreview.style.maxWidth = "100%";
                        imgPreview.style.marginTop = "10px";
                        imgPreview.style.border = "2px solid #2196F3";
                        
                        // Insertion après le conteneur applicatif
                        var container = document.querySelector("#app") || document.body;
                        container.appendChild(imgPreview);
                }

                imgPreview.src = dataUrl;
                
                // Alerte à destination de l'utilisateur sur ancien système
                alert("Capture effectuée ! Maintenez votre doigt appuyé sur l'image en bas de page pour la sauvegarder.");
        }
    }

    if (document.querySelector("#load") != null) {
        a = document.querySelector("#load");
    } else {
        a = document.body.appendChild(document.createElement("main"));
        a.id = "load";
    }

    if (document.querySelector("#app") != null) {
        b = document.querySelector("#app");
    } else {
        b = document.body.appendChild(document.createElement("main"));
        b.id = "app";
    }
    b.hidden = true;

    // HTML Structure
    a.innerHTML = '<div class="loadcontener"><select multiple="" id="loadedFiles"></select><div class="loadbuttons"><div class="loadbuttonscontener"><div><button id="remove"></button><button id="import"></button><button id="open">open</button></div><div id="selected">0</div></div></div><div class="waitload" style="translate: 0px -62px;"><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="waitloader" version="1.1" width="959" height="10" viewBox="0,0,959,10" style="max-width: unset !important;"><defs><linearGradient x1="-11.75" y1="100" x2="138.25" y2="100" gradientUnits="userSpaceOnUse" id="color-1"><stop offset="0" stop-color="#ff0000" stop-opacity="0"></stop><stop offset="1" stop-color="#ff0000"></stop></linearGradient><linearGradient x1="312.75" y1="100" x2="139.25" y2="100" gradientUnits="userSpaceOnUse" id="color-2"><stop offset="0" stop-color="#ff0000" stop-opacity="0"></stop><stop offset="1" stop-color="#ff0000"></stop></linearGradient><linearGradient x1="-324.5" y1="100" x2="-174.5" y2="100" gradientUnits="userSpaceOnUse" id="color-3"><stop offset="0" stop-color="#ff0000" stop-opacity="0"></stop><stop offset="1" stop-color="#ff0000"></stop></linearGradient><linearGradient x1="0" y1="100" x2="-173.5" y2="100" gradientUnits="userSpaceOnUse" id="color-4"><stop offset="0" stop-color="#ff0000" stop-opacity="0"></stop><stop offset="1" stop-color="#ff0000"></stop></linearGradient><linearGradient x1="300" y1="100" x2="450" y2="100" gradientUnits="userSpaceOnUse" id="color-5"><stop offset="0" stop-color="#ff0000" stop-opacity="0"></stop><stop offset="1" stop-color="#ff0000"></stop></linearGradient><linearGradient x1="624.5" y1="100" x2="451" y2="100" gradientUnits="userSpaceOnUse" id="color-6"><stop offset="0" stop-color="#ff0000" stop-opacity="0"></stop><stop offset="1" stop-color="#ff0000"></stop></linearGradient></defs><g transform="translate(329.5,-95)"><g fill="none" stroke-width="10" stroke-linecap="round" stroke-miterlimit="10"><path d="M-11.75,100h150" stroke="url(#color-1)"></path><path d="M312.75,100h-173.5" stroke="url(#color-2)"></path><path d="M-324.5,100h150" stroke="url(#color-3)"></path><path d="M0,100h-173.5" stroke="url(#color-4)"></path><path d="M300,100h150" stroke="url(#color-5)"></path><path d="M624.5,100h-173.5" stroke="url(#color-6)"></path></g></g></svg></div></div>';
    b.innerHTML = '<div class="appcontener"><input type="range" min="0" max="1" value="0"><video origine=""></video><div class="ui"><img home="" src="assets/0000.svg"><img write="" src="assets/0002.svg"><img video-="" src="assets/0004.svg"><img videoplus="" src="assets/0006.svg"><img capture="" src="assets/0008.svg"><img frame-="" src="assets/0010.svg"><img frameplus="" src="assets/0012.svg"><img player="" pause="" src="assets/0014.svg"><img play-mode="" src="assets/0016.svg"><img setup="" src="assets/0018.svg"></div></div>';

    // CSS injection
    c.innerHTML = '[hidden], .__web-inspector-hide-shortcut__ {display: none !important;} [content]::before {content: attr(content)} * {font-family: sans-serif;font-size: 20px;} select {background: none;border: none;overflow: auto;} .loadcontener {min-width: 460px;max-width: 460px;min-height: 270px;max-height: 270px;overflow: hidden;} .loadcontener * {max-width: 460px;max-height: 270px;} #loadedFiles {width: -webkit-fill-available;width: 100%;height: -webkit-fill-available;height: 100%;min-width: 460px;max-width: 460px;min-height: 270px;max-height: 270px; outline: none;} #loadedFiles option {background-color: #acacac;margin: 10px;padding-inline: 10px;} #loadedFiles option:hover {background-color: #ddd} #loadedFiles option:checked {background-color: #fff;} .loadbuttons {position: fixed;width: 100%;width: -webkit-fill-available;height: 40px;translate: 0px -40px;display: flex;flex-direction: row-reverse;background-color: #000;} .loadbuttonscontener {width: 100%;width: -webkit-fill-available;height: 100%;height: -webkit-fill-available;display: flex;flex-direction: row-reverse;justify-content: space-between;padding: 5px;} .loadbuttonscontener button {appearance: none;border-color: #fff;border-style: solid;border-width: 3px;background: #000;color: #fff;margin-inline-start: 5px;height: 100%;} .loadbuttonscontener button:hover {background-color: #8f8f8f;cursor: pointer;} #selected {display: flex;align-items: center;font-size: 20px;} #app {width: 100%;width: -webkit-fill-available;height: 100%;height: -webkit-fill-available;} .appcontener {width: 100%;width: -webkit-fill-available;height: 100%;height: -webkit-fill-available;} #app video[origine] {width: 100%;width: -webkit-fill-available;height: 100%;height: -webkit-fill-available;} .appcontener > .ui img {margin: 3px;} .appcontener > .ui {display: flex;align-items: center;justify-content: center;} input[type="range"] {width: 100%; width: -webkit-fill-available;} video {max-height: 80%;max-height: calc(100% - 75px);}';

    translation.push = function () {
        var lang = translation.currentLang;
        var selEl = document.querySelector("#load #selected");
        var impBtn = document.querySelector("#load #import");
        var remBtn = document.querySelector("#load #remove");

        if (selEl) {
            selEl.setAttribute("content", translation.selected[lang].text);
            selEl.title = translation.selected[lang].title;
        }
        if (impBtn) {
            impBtn.setAttribute("content", translation.import[lang].text);
            impBtn.title = translation.import[lang].title;
        }
        if (remBtn) {
            remBtn.setAttribute("content", translation.remove[lang].text);
            remBtn.title = translation.remove[lang].title;
        }
    };
    translation.push();

    document.querySelector("#import").onclick = function () {
        try {
            var d = document.createElement("input");
            d.type = "file";
            d.accept = "video/*";
            d.multiple = true;
            d.setAttribute("loading", "please do not remove this element");
            d.hidden = true;
            document.body.appendChild(d);
            wait = true;
            d.click();

            d.addEventListener("change", function (e) {
                try {
                    if (e.target.files && e.target.files.length > 0) {
                        validFile(e.target.files);
                    }
                } catch (error) {
                    appendErrorOption(document.querySelector("#loadedFiles"), error.message || error);
                } finally {
                    if (d.parentNode) d.parentNode.removeChild(d);
                    wait = false;
                }
            });

            d.addEventListener("cancel", function () {
                if (d.parentNode) d.parentNode.removeChild(d);
                wait = false;
            });
        } catch (importError) {
            appendErrorOption(document.querySelector("#loadedFiles"), importError.message || importError);
        }
    };

    var f = document.createElement('img');
    f.src = "assets/0019.svg";
    f.id = "wait";

    var rotateWaitDiv = document.createElement("div");
    rotateWaitDiv.id = "rotateWait";
    rotateWaitDiv.style.cssText = "position: fixed; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;";
    rotateWaitDiv.appendChild(f);
    document.body.insertBefore(rotateWaitDiv, document.querySelector("#load"));

    var rotateAngle = 0;
    var translateX = 0;
    var m = document.querySelector(".waitloader");

    // Animation de rotation du loader
    setInterval(function () {
        rotateAngle = (rotateAngle - 1 + 360) % 360;
        f.style.transform = "rotate(" + rotateAngle + "deg)";

        if (wait) {
            if (document.querySelector("#load").hidden) {
                document.querySelector("#rotateWait").hidden = false;
                document.querySelector(".waitload").hidden = true;
            } else {
                document.querySelector("#rotateWait").hidden = true;
                document.querySelector(".waitload").hidden = false;
            }
        } else {
            document.querySelector("#rotateWait").hidden = true;
            document.querySelector(".waitload").hidden = true;
        }
    }, 10);

    // Animation SVG du loader secondaire
    setInterval(function () {
        translateX++;
        if (translateX > 0) {
            translateX = -310;
        }
        if (m) {
            m.style.transform = "translateX(" + translateX + "px)";
        }
    }, 2);

    // Mettre à jour les éléments
    setInterval(function () {
        var selectEl = document.querySelector("#loadedFiles");
        var selectedCountEl = document.querySelector("#selected");
        if (selectEl && selectedCountEl) {
            selectedCountEl.textContent = selectEl.selectedOptions.length;
        }
        if (document.querySelector("img[home]:hover")) {
            document.querySelector("img[home]").src = "assets/0001.svg";
        } else {
            document.querySelector("img[home]").src = "assets/0000.svg";
        }
        if (document.querySelector("img[write]:hover")) {
            document.querySelector("img[write]").src = "assets/0003.svg";
        } else {
            document.querySelector("img[write]").src = "assets/0002.svg";
        }
        if (document.querySelector("img[video-]:hover")) {
            document.querySelector("img[video-]").src = "assets/0005.svg";
        } else {
            document.querySelector("img[video-]").src = "assets/0004.svg";
        }
        if (document.querySelector("img[videoplus]:hover")) {
            document.querySelector("img[videoplus]").src = "assets/0007.svg";
        } else {
            document.querySelector("img[videoplus]").src = "assets/0006.svg";
        }
        if (document.querySelector("img[capture]:hover")) {
            document.querySelector("img[capture]").src = "assets/0009.svg";
        } else {
            document.querySelector("img[capture]").src = "assets/0008.svg";
        }
        if (document.querySelector("img[frame-]:hover")) {
            document.querySelector("img[frame-]").src = "assets/0011.svg";
        } else {
            document.querySelector("img[frame-]").src = "assets/0010.svg";
        }
        if (document.querySelector("img[frameplus]:hover")) {
            document.querySelector("img[frameplus]").src = "assets/0013.svg";
        } else {
            document.querySelector("img[frameplus]").src = "assets/0012.svg";
        }
        if (document.querySelector("img[player][pause]:hover")) {
            document.querySelector("img[player][pause]").src = "assets/0015.svg";
        } else {
            document.querySelector("img[player][pause]").src = "assets/0014.svg";
        }
        if (document.querySelector("img[play-mode]:hover")) {
            document.querySelector("img[play-mode]").src = "assets/0017.svg";
        } else {
            document.querySelector("img[play-mode]").src = "assets/0016.svg";
        }
        if (document.querySelector("img[setup]:hover")) {
            document.querySelector("img[setup]").src = "assets/0017.svg";
        } else {
            document.querySelector("img[setup]").src = "assets/0018.svg";
        }
        if (document.querySelector("video").played) {
            document.querySelector('input[type="range"]').value = document.querySelector('video').currentTime;
        }
    }, 100);

    document.querySelector("#loadedFiles").ondblclick = function (e) {
        var option = e.target.closest("option");
        if (option && option.value && option.value !== "error") {
            openVideo(option.value, 0);
        }
    };

    document.querySelector("button#remove").onclick = function () {
        var selectedOptions = document.querySelectorAll("#loadedFiles option:checked");
        for (var i = 0; i < selectedOptions.length; i++) {
            selectedOptions[i].parentNode.removeChild(selectedOptions[i]);
        }
    };
    document.querySelector("button#open").onclick = function () {
        var checkedOption = document.querySelector("#loadedFiles option:checked");
        if (checkedOption && checkedOption.value && checkedOption.value !== "error") {
            openVideo(checkedOption.value, 0);
        }
    };

    onkeydown = function (event) {
        if (event.key === "Enter") {
            var checkedOption = document.querySelector("#loadedFiles option:checked");
            if (checkedOption && checkedOption.value && checkedOption.value !== "error") {
                openVideo(checkedOption.value, 0);
            }
        }
    };

    // gestions des boutons de l'UI
    document.querySelector("[home]").onclick = function () {
        document.querySelector("#app").hidden = true;
        document.querySelector("#load"). hidden = false;
    }
    document.querySelector("[capture]").onclick = function () {
        captureFrameToPng(document.querySelector("video"));
    }
    document.querySelector("[frameplus]").onclick = function () {
        stepFrame(document.querySelector("video"), 1, 24);
    }
    document.querySelector("[frame-]").onclick = function () {
        stepBackward(document.querySelector("video"), 24);
    }
    document.querySelector("[player]").onclick = function () {
        var vidNod = document.querySelector("video");
        if (vidNod.paused) {
            vidNod.play();
        } else {
            vidNod.pause();
        }
    }
    document.querySelector('input[type="range"]').onchange = function () {
        if (document.querySelector('video').paused) {
            document.querySelector('video').currentTime = document.querySelector('input[type="range"]').value;
        } else {
            document.querySelector('video').pause();
            document.querySelector('video').currentTime = document.querySelector('input[type="range"]').value;
            document.querySelector('video').play();
        }
    }

    // affichage des erreurs
    win.onerror = function (msg) {
        var selectEl = document.querySelector("#loadedFiles");
        if (selectEl) {
            appendErrorOption(selectEl, msg);
        }
    };
})(window);
