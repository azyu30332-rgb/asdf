package kr.chaekjang.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import androidx.core.content.FileProvider;
import androidx.exifinterface.media.ExifInterface;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String ORIGIN = "https://" + HOST;
    static final int EXPORT=1001, IMPORT=1002, SHARE=1003, PHOTO=1004, CAMERA=1005, FILE_CHOOSER=1006;
    private static final int MAX_BYTES=128*1024*1024, MAX_PHOTO_BYTES=32*1024*1024;
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private final List<String> pendingScripts=new ArrayList<>();
    private WebView webView;
    private FrameLayout rootContainer;
    private boolean pageReady;
    private int activePicker;
    private String photoRequestId;
    private File cameraFile;
    private ValueCallback<Uri[]> fileCallback;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        // Do not restore a stale busy flag: cancelled pickers must never disable backup forever.
        if(state!=null){photoRequestId=state.getString("photoRequestId");String name=state.getString("cameraFile");if(name!=null)cameraFile=new File(new File(getCacheDir(),"camera"),name);}
        FrameLayout container=new FrameLayout(this);rootContainer=container;container.setBackgroundColor(Color.rgb(245,248,246));
        webView=new WebView(this);webView.setId(android.R.id.primary);container.addView(webView,new FrameLayout.LayoutParams(-1,-1));setContentView(container);
        if(Build.VERSION.SDK_INT>=30){container.setOnApplyWindowInsetsListener((view,insets)->{android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());view.setPadding(bars.left,bars.top,bars.right,bars.bottom);return WindowInsets.CONSUMED;});container.requestApplyInsets();}
        WebSettings settings=webView.getSettings();
        // JS executes only the bundled UI. No network, file navigation, or untrusted HTML is loaded.
        settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setBlockNetworkLoads(true);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setSupportMultipleWindows(false);
        webView.setBackgroundColor(Color.rgb(245,248,246));webView.addJavascriptInterface(new NativeFiles(),"ChaekjangNative");
        webView.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                Uri uri=request.getUrl();
                // Let WebView decode the small bundled JPEG thumbnails locally.
                // These data URLs perform no network request and are also validated before storage.
                if("data".equals(uri.getScheme())&&uri.toString().startsWith("data:image/jpeg;base64,")&&uri.toString().length()<=33000)return null;
                if("https".equals(uri.getScheme())&&HOST.equals(uri.getHost())&&"/index.html".equals(uri.getPath())&&"GET".equals(request.getMethod())){try{return new WebResourceResponse("text/html","UTF-8",getAssets().open("index.html"));}catch(Exception ignored){}}
                return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",java.util.Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return true;}
            @Override public void onPageFinished(WebView view,String url){if(!(ORIGIN+"/index.html").equals(url))return;pageReady=true;for(String script:pendingScripts)view.evaluateJavascript(script,null);pendingScripts.clear();}
        });
        webView.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onJsConfirm(WebView view,String url,String message,JsResult result){new AlertDialog.Builder(MainActivity.this).setTitle("책장").setMessage(message).setPositiveButton("확인",(d,w)->result.confirm()).setNegativeButton("취소",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;}
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;
                if(!beginPicker(FILE_CHOOSER)){callback.onReceiveValue(null);fileCallback=null;return true;}
                try{Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");String[] types=params.getAcceptTypes();if(types!=null&&types.length>0&&!types[0].isEmpty())intent.putExtra(Intent.EXTRA_MIME_TYPES,types);startActivityForResult(intent,FILE_CHOOSER);}catch(Exception e){activePicker=0;callback.onReceiveValue(null);fileCallback=null;notifyUser("파일 선택 창을 열지 못했어요.");}return true;
            }
        });
        webView.loadUrl(ORIGIN+"/index.html");
    }
    private boolean beginPicker(int code){if(activePicker!=0){notifyUser("파일이나 사진 선택을 마친 뒤 다시 눌러 주세요.");return false;}activePicker=code;return true;}
    private void sendScript(String script){runOnUiThread(()->{if(isFinishing()||isDestroyed())return;if(pageReady)webView.evaluateJavascript(script,null);else pendingScripts.add(script);});}
    private void event(String name,String json){sendScript("window.dispatchEvent(new CustomEvent("+JSONObject.quote(name)+",{detail:"+json+"}));");}
    private void notifyUser(String message){event("chaekjang-message",JSONObject.quote(message));}
    private File backupFile(){return new File(getCacheDir(),"pending-backup.json");}
    private byte[] readLimited(InputStream in,int max) throws Exception{
        if(in==null)throw new Exception("No readable stream");try(InputStream stream=in;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[8192];int size;while((size=stream.read(buffer))!=-1){if(out.size()+size>max)throw new Exception("File too large");out.write(buffer,0,size);}return out.toByteArray();}
    }
    private void reportPhoto(String token,String photo,String error){
        try{JSONObject result=new JSONObject();result.put("requestId",token);result.put("photo",photo==null?JSONObject.NULL:photo);result.put("error",error==null?JSONObject.NULL:error);event("chaekjang-photo",result.toString());}catch(Exception ignored){}
    }
    public final class NativeFiles {
        @JavascriptInterface public String getAppVersion(){
            try{return getPackageManager().getPackageInfo(getPackageName(),0).versionName;}
            catch(android.content.pm.PackageManager.NameNotFoundException e){return "확인 불가";}
        }
        @JavascriptInterface public void setTheme(String theme){runOnUiThread(()->{
            if(isFinishing()||isDestroyed())return;
            boolean dark="dark".equals(theme);
            int background=Color.parseColor(dark?"#161d24":"cream".equals(theme)?"#f8f2e8":"blue".equals(theme)?"#f1f6fc":"#f5f8f6");
            rootContainer.setBackgroundColor(background);webView.setBackgroundColor(background);
            getWindow().setStatusBarColor(background);getWindow().setNavigationBarColor(background);
            if(Build.VERSION.SDK_INT>=30){android.view.WindowInsetsController controller=getWindow().getInsetsController();if(controller!=null){int mask=android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;controller.setSystemBarsAppearance(dark?0:mask,mask);}}
            else{int flags=dark?0:android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;if(!dark&&Build.VERSION.SDK_INT>=27)flags|=android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;getWindow().getDecorView().setSystemUiVisibility(flags);}
        });}
        @JavascriptInterface public void exportBackup(String text,String mode){runOnUiThread(()->{
            int code="share".equals(mode)?SHARE:EXPORT;if(!beginPicker(code))return;
            io.execute(()->{try{
                byte[] bytes=text.getBytes(StandardCharsets.UTF_8);if(bytes.length>MAX_BYTES)throw new Exception("Backup too large");JSONObject json=new JSONObject(text);int version=json.getInt("version");if((version!=1&&version!=2)||json.optJSONArray("books")==null)throw new Exception("Invalid backup");
                File destination=backupFile();if(code==SHARE){File dir=new File(getCacheDir(),"backups");if(!dir.isDirectory()&&!dir.mkdirs())throw new Exception("Cannot create backup directory");destination=new File(dir,"책장-백업-"+java.time.LocalDate.now()+"-"+UUID.randomUUID()+".json");}
                try(OutputStream out=new FileOutputStream(destination)){out.write(bytes);}final File file=destination;
                runOnUiThread(()->{try{
                    if(code==SHARE){Uri uri=FileProvider.getUriForFile(MainActivity.this,getPackageName()+".files",file);Intent send=new Intent(Intent.ACTION_SEND).setType("application/json").putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);send.setClipData(ClipData.newRawUri("책장 백업",uri));startActivityForResult(Intent.createChooser(send,"백업을 저장하거나 업로드할 앱"),SHARE);}
                    else{Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE,"책장-백업-"+java.time.LocalDate.now()+".json");startActivityForResult(intent,EXPORT);}
                }catch(Exception e){activePicker=0;notifyUser(code==SHARE?"공유할 앱을 찾지 못했어요. 파일 저장을 이용해 주세요.":"파일 저장 창을 열지 못했어요. 백업의 공유 버튼을 이용해 주세요.");}});
            }catch(Exception e){runOnUiThread(()->activePicker=0);notifyUser("백업을 준비하지 못했어요. 저장 공간과 파일 크기(128MB 이하)를 확인해 주세요.");}});
        });}
        @JavascriptInterface public void importBackup(){runOnUiThread(()->{if(!beginPicker(IMPORT))return;try{Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");startActivityForResult(intent,IMPORT);}catch(Exception e){activePicker=0;notifyUser("파일 선택 창을 열지 못했어요. 휴대폰의 파일 앱을 확인해 주세요.");}});}
        @JavascriptInterface public void choosePhoto(String requestId){runOnUiThread(()->{if(!beginPicker(PHOTO)){reportPhoto(requestId,null,"다른 파일 선택을 마친 뒤 다시 눌러 주세요.");return;}photoRequestId=requestId;try{startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*"),PHOTO);}catch(Exception e){activePicker=0;reportPhoto(requestId,null,"사진 선택 창을 열지 못했어요.");}});}
        @JavascriptInterface public void takePhoto(String requestId){runOnUiThread(()->{if(!beginPicker(CAMERA)){reportPhoto(requestId,null,"다른 파일 선택을 마친 뒤 다시 눌러 주세요.");return;}photoRequestId=requestId;try{
            File dir=new File(getCacheDir(),"camera");if(!dir.isDirectory()&&!dir.mkdirs())throw new Exception("Cannot create camera directory");cameraFile=new File(dir,UUID.randomUUID()+".jpg");Uri uri=FileProvider.getUriForFile(MainActivity.this,getPackageName()+".files",cameraFile);Intent intent=new Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT,uri).addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_READ_URI_PERMISSION);intent.setClipData(ClipData.newRawUri("책 표지 사진",uri));startActivityForResult(intent,CAMERA);
        }catch(Exception e){activePicker=0;reportPhoto(requestId,null,"카메라를 열지 못했어요. 사진 선택으로 등록해 주세요.");}});}
    }
    private String thumbnail(byte[] input) throws Exception{
        BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(input,0,input.length,options);if(options.outWidth<1||options.outHeight<1)throw new Exception("Unsupported photo");options.inJustDecodeBounds=false;options.inSampleSize=1;while(Math.max(options.outWidth,options.outHeight)/options.inSampleSize>640)options.inSampleSize*=2;
        Bitmap source=BitmapFactory.decodeByteArray(input,0,input.length,options);if(source==null)throw new Exception("Cannot decode photo");
        try{
            Matrix transform=new Matrix();int orientation=new ExifInterface(new ByteArrayInputStream(input)).getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL);
            switch(orientation){case 2:transform.setScale(-1,1);break;case 3:transform.setRotate(180);break;case 4:transform.setScale(1,-1);break;case 5:transform.setRotate(90);transform.postScale(-1,1);break;case 6:transform.setRotate(90);break;case 7:transform.setRotate(270);transform.postScale(-1,1);break;case 8:transform.setRotate(270);break;default:break;}
            if(!transform.isIdentity()){Bitmap rotated=Bitmap.createBitmap(source,0,0,source.getWidth(),source.getHeight(),transform,true);if(rotated!=source){source.recycle();source=rotated;}}
            for(int edge:new int[]{320,240,160}){
                float ratio=Math.min(1f,(float)edge/Math.max(source.getWidth(),source.getHeight()));Bitmap output=Bitmap.createBitmap(Math.max(1,Math.round(source.getWidth()*ratio)),Math.max(1,Math.round(source.getHeight()*ratio)),Bitmap.Config.ARGB_8888);Canvas canvas=new Canvas(output);canvas.drawColor(Color.WHITE);canvas.drawBitmap(source,null,new android.graphics.Rect(0,0,output.getWidth(),output.getHeight()),new android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG));
                try{for(int quality:new int[]{80,65,50,35}){ByteArrayOutputStream bytes=new ByteArrayOutputStream();if(!output.compress(Bitmap.CompressFormat.JPEG,quality,bytes))throw new Exception("Cannot encode photo");if(bytes.size()<=24576)return "data:image/jpeg;base64,"+Base64.encodeToString(bytes.toByteArray(),Base64.NO_WRAP);}}
                finally{output.recycle();}
            }
            throw new Exception("Photo too complex");
        }finally{source.recycle();}
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode==FILE_CHOOSER){activePicker=0;if(fileCallback!=null){fileCallback.onReceiveValue(resultCode==RESULT_OK&&data!=null?new Uri[]{data.getData()}:null);fileCallback=null;}return;}
        if(requestCode==SHARE){activePicker=0;notifyUser("공유 앱에서 업로드 완료 여부를 확인해 주세요.");return;}
        if(requestCode!=EXPORT&&requestCode!=IMPORT&&requestCode!=PHOTO&&requestCode!=CAMERA)return;
        final String token=photoRequestId;
        if(resultCode!=RESULT_OK||(requestCode!=CAMERA&&(data==null||data.getData()==null))){activePicker=0;if(requestCode==EXPORT)backupFile().delete();if(requestCode==PHOTO||requestCode==CAMERA){reportPhoto(token,null,null);if(cameraFile!=null)cameraFile.delete();}else notifyUser("파일 선택을 취소했어요.");return;}
        final Uri uri=requestCode==CAMERA?null:data.getData();final File capture=cameraFile;
        io.execute(()->{try{
            if(requestCode==EXPORT){try(InputStream in=new FileInputStream(backupFile());OutputStream out=getContentResolver().openOutputStream(uri,"wt")){if(out==null)throw new Exception("No output stream");byte[] buffer=new byte[8192];int size;while((size=in.read(buffer))!=-1)out.write(buffer,0,size);}notifyUser("백업 파일을 저장했어요. 선택한 폴더에서 확인해 주세요.");}
            else if(requestCode==IMPORT){String text=new String(readLimited(getContentResolver().openInputStream(uri),MAX_BYTES),StandardCharsets.UTF_8);event("chaekjang-restore",JSONObject.quote(text));}
            else{byte[] bytes=readLimited(requestCode==CAMERA?new FileInputStream(capture):getContentResolver().openInputStream(uri),MAX_PHOTO_BYTES);reportPhoto(token,thumbnail(bytes),null);}
        }catch(Exception|OutOfMemoryError e){if(requestCode==PHOTO||requestCode==CAMERA)reportPhoto(token,null,"사진을 읽지 못했어요. 32MB 이하의 JPG 또는 PNG 사진으로 다시 선택해 주세요.");else notifyUser(requestCode==EXPORT?"파일을 저장하지 못했어요. 다른 폴더나 공유 버튼을 이용해 주세요.":"파일을 읽지 못했어요. 128MB 이하의 JSON 백업인지 확인해 주세요.");}
        finally{if(requestCode==EXPORT)backupFile().delete();if(requestCode==CAMERA&&capture!=null)capture.delete();runOnUiThread(()->activePicker=0);}});
    }
    @Override protected void onSaveInstanceState(Bundle outState){outState.putString("photoRequestId",photoRequestId);if(cameraFile!=null)outState.putString("cameraFile",cameraFile.getName());super.onSaveInstanceState(outState);}
    @Override public void onBackPressed(){webView.evaluateJavascript("(()=>{const d=document.querySelector('dialog[open]');if(d){d.close();return true;}return false;})()",handled->{if(!"true".equals(handled))super.onBackPressed();});}
    @Override protected void onDestroy(){if(fileCallback!=null)fileCallback.onReceiveValue(null);if(webView!=null){webView.removeJavascriptInterface("ChaekjangNative");webView.destroy();}io.shutdown();super.onDestroy();}
}
