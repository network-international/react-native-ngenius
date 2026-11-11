package ae.network;

import android.content.Context;
import android.os.Build;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;

import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;

/** Applies Android's cross-window blur to the transparent React Native modal. */
public final class NITokenizationBackdropBlurManager
        extends SimpleViewManager<NITokenizationBackdropBlurManager.BackdropView> {
    @Override
    public String getName() {
        return "NITokenizationBackdropBlur";
    }

    @Override
    protected BackdropView createViewInstance(ThemedReactContext context) {
        return new BackdropView(context);
    }

    static final class BackdropView extends View {
        private View modalDecor;
        private int previousRadius;
        private boolean previousBlurFlag;

        BackdropView(Context context) {
            super(context);
        }

        @Override
        protected void onAttachedToWindow() {
            super.onAttachedToWindow();
            if (Build.VERSION.SDK_INT >= 31) post(this::applyBlur);
        }

        private void applyBlur() {
            if (!isAttachedToWindow() || modalDecor != null) return;
            View root = getRootView();
            ViewGroup.LayoutParams rawParams = root.getLayoutParams();
            if (!(rawParams instanceof WindowManager.LayoutParams)) return;
            WindowManager.LayoutParams params = (WindowManager.LayoutParams) rawParams;
            WindowManager manager = (WindowManager) root.getContext().getSystemService(Context.WINDOW_SERVICE);
            if (manager == null) return;

            previousBlurFlag = (params.flags & WindowManager.LayoutParams.FLAG_BLUR_BEHIND) != 0;
            try {
                // Reflection keeps the library buildable with older compile SDKs.
                previousRadius = (int) WindowManager.LayoutParams.class
                        .getMethod("getBlurBehindRadius").invoke(params);
                setBlurRadius(params, Math.round(24 * getResources().getDisplayMetrics().density));
                setBlurFlag(params, true);
                manager.updateViewLayout(root, params);
                modalDecor = root;
            } catch (ReflectiveOperationException | RuntimeException ignored) {
                setBlurFlag(params, previousBlurFlag);
                // The JavaScript scrim remains visible when the OS cannot blur.
            }
        }

        @Override
        protected void onDetachedFromWindow() {
            View root = modalDecor;
            modalDecor = null;
            if (root != null && root.isAttachedToWindow()
                    && root.getLayoutParams() instanceof WindowManager.LayoutParams) {
                WindowManager.LayoutParams params = (WindowManager.LayoutParams) root.getLayoutParams();
                WindowManager manager = (WindowManager) root.getContext().getSystemService(Context.WINDOW_SERVICE);
                try {
                    setBlurFlag(params, previousBlurFlag);
                    setBlurRadius(params, previousRadius);
                    if (manager != null) manager.updateViewLayout(root, params);
                } catch (ReflectiveOperationException | RuntimeException ignored) {
                    // The dialog may already be detached when the sheet closes.
                }
            }
            super.onDetachedFromWindow();
        }

        private static void setBlurRadius(WindowManager.LayoutParams params, int radius)
                throws ReflectiveOperationException {
            WindowManager.LayoutParams.class.getMethod("setBlurBehindRadius", int.class).invoke(params, radius);
        }

        private static void setBlurFlag(WindowManager.LayoutParams params, boolean enabled) {
            if (enabled) params.flags |= WindowManager.LayoutParams.FLAG_BLUR_BEHIND;
            else params.flags &= ~WindowManager.LayoutParams.FLAG_BLUR_BEHIND;
        }
    }
}
