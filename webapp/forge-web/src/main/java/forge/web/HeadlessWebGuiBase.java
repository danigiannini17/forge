package forge.web;

import forge.gamemodes.match.HostedMatch;
import forge.gui.FThreads;
import forge.gui.download.GuiDownloadService;
import forge.gui.interfaces.IGuiBase;
import forge.gui.interfaces.IGuiGame;
import forge.item.PaperCard;
import forge.localinstance.skin.FSkinProp;
import forge.localinstance.skin.ISkinImage;
import forge.sound.IAudioClip;
import forge.sound.IAudioMusic;
import forge.util.BuildInfo;
import forge.util.FSerializableFunction;
import forge.util.ImageFetcher;
import org.jupnp.UpnpServiceConfiguration;

import java.io.File;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.function.Consumer;

/**
 * Headless implementation of {@link IGuiBase} for the Forge Multi-Room Web Server.
 * Allows {@code forge-gui} and {@code FModel} to run on a server without Swing or LibGDX.
 */
public class HeadlessWebGuiBase implements IGuiBase {

    private final String assetsDir;
    private final ISkinImage dummySkinImage = new ISkinImage() {};
    private final ImageFetcher dummyImageFetcher = new ImageFetcher() {
        @Override
        protected Runnable getDownloadTask(String[] toArray, String destPath, Runnable notifyObservers) {
            return () -> {};
        }
    };

    public HeadlessWebGuiBase(String assetsDir) {
        if (!assetsDir.endsWith(File.separator) && !assetsDir.endsWith("/")) {
            assetsDir = assetsDir + "/";
        }
        this.assetsDir = assetsDir;
    }

    @Override
    public boolean isRunningOnDesktop() {
        return true;
    }

    @Override
    public boolean isLibgdxPort() {
        return false;
    }

    @Override
    public String getCurrentVersion() {
        try {
            return BuildInfo.getVersionString();
        } catch (Exception e) {
            return "2.0.17-SNAPSHOT";
        }
    }

    @Override
    public String getUserAgent() {
        return "ForgeWeb/" + getCurrentVersion();
    }

    @Override
    public void invokeInEdtNow(Runnable runnable) {
        if (runnable != null) {
            runnable.run();
        }
    }

    @Override
    public void invokeInEdtLater(Runnable runnable) {
        if (runnable != null) {
            runnable.run();
        }
    }

    @Override
    public void invokeInEdtAndWait(Runnable proc) {
        if (proc != null) {
            proc.run();
        }
    }

    @Override
    public void runBackgroundTask(String message, Runnable task) {
        if (task != null) {
            FThreads.invokeInBackgroundThread(task);
        }
    }

    @Override
    public boolean isGuiThread() {
        // Returning true ensures InputProxy.update() runs input.showMessageInitial()
        // synchronously before InputSyncronizedBase blocks on cdlDone.await()
        return true;
    }

    @Override
    public String getAssetsDir() {
        return assetsDir;
    }

    @Override
    public ImageFetcher getImageFetcher() {
        return dummyImageFetcher;
    }

    @Override
    public ISkinImage getSkinIcon(FSkinProp skinProp) {
        return dummySkinImage;
    }

    @Override
    public ISkinImage getUnskinnedIcon(String path) {
        return dummySkinImage;
    }

    @Override
    public ISkinImage getCardArt(PaperCard card, boolean backFace) {
        return dummySkinImage;
    }

    @Override
    public ISkinImage createLayeredImage(PaperCard card, FSkinProp background, String overlayFilename, float opacity) {
        return dummySkinImage;
    }

    @Override
    public void clearImageCache() {
    }

    @Override
    public String encodeSymbols(String str, boolean formatReminderText) {
        return str != null ? str : "";
    }

    @Override
    public int getAvatarCount() {
        return 30;
    }

    @Override
    public int getSleevesCount() {
        return 20;
    }

    @Override
    public float getScreenScale() {
        return 1.0f;
    }

    @Override
    public void preventSystemSleep(boolean preventSleep) {
    }

    @Override
    public void download(GuiDownloadService service, Consumer<Boolean> callback) {
        if (callback != null) {
            callback.accept(false);
        }
    }

    @Override
    public void copyToClipboard(String text) {
    }

    @Override
    public void browseToUrl(String url) {
    }

    @Override
    public void showCardList(String title, String message, List<PaperCard> list) {
    }

    @Override
    public boolean showBoxedProduct(String title, String message, List<PaperCard> list) {
        return true;
    }

    @Override
    public void showBugReportDialog(String title, String text, boolean showExitAppBtn) {
        System.err.println("[Forge BugReport] " + title + ": " + text);
    }

    @Override
    public void showImageDialog(ISkinImage image, String message, String title) {
    }

    @Override
    public int showOptionDialog(String message, String title, FSkinProp icon, List<String> options, int defaultOption) {
        System.out.println("[HeadlessWebGuiBase OptionDialog] " + title + ": " + message);
        return Math.max(0, defaultOption);
    }

    @Override
    public String showInputDialog(String message, String title, FSkinProp icon, String initialInput, List<String> inputOptions, boolean isNumeric) {
        return initialInput != null ? initialInput : "";
    }

    @Override
    public String showFileDialog(String title, String defaultDir) {
        return null;
    }

    @Override
    public File getSaveFile(File defaultFile) {
        return defaultFile;
    }

    @Override
    public <T> List<T> order(String title, String top, int remainingObjectsMin, int remainingObjectsMax, List<T> sourceChoices, List<T> destChoices) {
        return sourceChoices != null ? new ArrayList<>(sourceChoices) : Collections.emptyList();
    }

    @Override
    public <T> List<T> getChoices(String message, int min, int max, Collection<T> choices, Collection<T> selected, FSerializableFunction<T, String> display) {
        if (choices == null || choices.isEmpty()) {
            return Collections.emptyList();
        }
        List<T> result = new ArrayList<>();
        int count = Math.max(0, min);
        for (T item : choices) {
            if (result.size() >= count) {
                break;
            }
            result.add(item);
        }
        return result;
    }

    @Override
    public PaperCard chooseCard(String title, String message, List<PaperCard> list) {
        return (list != null && !list.isEmpty()) ? list.get(0) : null;
    }

    @Override
    public boolean isSupportedAudioFormat(File file) {
        return false;
    }

    @Override
    public IAudioClip createAudioClip(String filename) {
        return new IAudioClip() {
            @Override public void play(float value) {}
            @Override public boolean isDone() { return true; }
            @Override public void stop() {}
            @Override public void loop() {}
            @Override public void dispose() {}
        };
    }

    @Override
    public IAudioMusic createAudioMusic(String filename) {
        return new IAudioMusic() {
            @Override public void play(Runnable onComplete) {}
            @Override public void pause() {}
            @Override public void resume() {}
            @Override public void stop() {}
            @Override public void dispose() {}
            @Override public void setVolume(float value) {}
            @Override public boolean isPlaying() { return false; }
        };
    }

    @Override
    public void startAltSoundSystem(String filename, boolean isSynchronized) {
    }

    @Override
    public void showSpellShop() {
    }

    @Override
    public void showBazaar() {
    }

    @Override
    public IGuiGame getNewGuiGame() {
        return null;
    }

    @Override
    public HostedMatch hostMatch() {
        return new HostedMatch();
    }

    @Override
    public UpnpServiceConfiguration getUpnpPlatformService() {
        return null;
    }

    @Override
    public boolean hasNetGame() {
        return true;
    }
}
