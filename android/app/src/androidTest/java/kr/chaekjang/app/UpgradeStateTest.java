package kr.chaekjang.app;

import static org.junit.Assert.*;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.webkit.WebView;
import androidx.test.ext.junit.rules.ActivityScenarioRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

/** Invoked in two separate instrumentation runs around adb install -r, never as ordinary tests. */
@RunWith(AndroidJUnit4.class)
public class UpgradeStateTest {
    @Rule public ActivityScenarioRule<MainActivity> activity=new ActivityScenarioRule<>(MainActivity.class);
    private android.content.Context context(){return InstrumentationRegistry.getInstrumentation().getTargetContext();}
    private String js(String code)throws Exception{CountDownLatch latch=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();activity.getScenario().onActivity(a->((WebView)a.findViewById(android.R.id.primary)).evaluateJavascript(code,r->{value.set(r);latch.countDown();}));assertTrue(latch.await(10,TimeUnit.SECONDS));return value.get();}
    private String text(String expression)throws Exception{Object value=new JSONTokener(js(expression)).nextValue();assertTrue(value instanceof String);return (String)value;}
    private void assertStrings(JSONArray expected,String expression)throws Exception{JSONArray actual=new JSONArray(js(expression));assertEquals(expected.length(),actual.length());for(int i=0;i<expected.length();i++)assertEquals(expected.getString(i),actual.getString(i));}
    private void waitFor(String condition)throws Exception{long end=System.currentTimeMillis()+30000;while(System.currentTimeMillis()<end){if("true".equals(js(condition)))return;Thread.sleep(100);}fail("Upgrade test timed out: "+condition);}
    @Before public void ready()throws Exception{
        for(String command:new String[]{"input keyevent KEYCODE_WAKEUP","wm dismiss-keyguard","am force-stop com.google.android.apps.nexuslauncher"})try(InputStream in=new android.os.ParcelFileDescriptor.AutoCloseInputStream(InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(command))){byte[] buffer=new byte[1024];while(in.read(buffer)!=-1){}}
        activity.getScenario().onActivity(a->a.startActivity(new Intent(a,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT|Intent.FLAG_ACTIVITY_SINGLE_TOP)));
        waitFor("document.querySelector('#loading')?.hidden===true && ready");
    }
    @Test public void seedPreviousVersion()throws Exception{
        assertEquals(InstrumentationRegistry.getArguments().getString("previousVersion"),context().getPackageManager().getPackageInfo(context().getPackageName(),0).versionName);
        Bitmap bitmap=Bitmap.createBitmap(240,320,Bitmap.Config.ARGB_8888);bitmap.eraseColor(Color.rgb(33,120,88));ByteArrayOutputStream bytes=new ByteArrayOutputStream();assertTrue(bitmap.compress(Bitmap.CompressFormat.JPEG,85,bytes));bitmap.recycle();String photo="data:image/jpeg;base64,"+android.util.Base64.encodeToString(bytes.toByteArray(),android.util.Base64.NO_WRAP);
        JSONObject book=new JSONObject();book.put("id","upgrade-preserved");book.put("title","업데이트 사진 보존");book.put("author","이전 작가");book.put("note","기존 메모와 사진을 보존합니다");book.put("createdAt",1700000000000L);book.put("photo",photo);book.put("volumes",new JSONArray("[{\"number\":1,\"status\":\"거래완료\",\"soldAt\":\"2025-03-04\"},{\"number\":2,\"status\":\"보유중\"},{\"number\":3,\"status\":\"미보유\"}]"));
        boolean modern="true".equals(js("typeof bookPhotos==='function' && typeof folders!=='undefined'"));JSONArray folderNames=new JSONArray();
        if("true".equals(js("typeof FAVORITE_COLORS!=='undefined'")))book.put("favorite","red");
        if(modern){book.put("photos",new JSONArray().put(photo).put(photo));book.put("folder","업데이트 보관");folderNames.put("업데이트 보관");folderNames.put("빈 폴더");}
        try(OutputStream out=new FileOutputStream(new File(context().getFilesDir(),"upgrade-folders.json"))){out.write(folderNames.toString().getBytes(StandardCharsets.UTF_8));}
        try(OutputStream out=new FileOutputStream(new File(context().getFilesDir(),"upgrade-expected.json"))){out.write(book.toString().getBytes(StandardCharsets.UTF_8));}
        js("persist(["+book+"],"+folderNames+").then(()=>window.__upgradeSaved=true)");waitFor("window.__upgradeSaved===true && !saveBusy");assertEquals(photo,text("books[0].photo"));
    }
    @Test public void verifyAfterReplaceInstall()throws Exception{
        assertEquals(InstrumentationRegistry.getArguments().getString("expectedVersion"),context().getPackageManager().getPackageInfo(context().getPackageName(),0).versionName);
        JSONObject expected=new JSONObject(new String(Files.readAllBytes(new File(context().getFilesDir(),"upgrade-expected.json").toPath()),StandardCharsets.UTF_8));
        assertEquals("1",js("books.length"));if(expected.has("favorite"))assertEquals(expected.getString("favorite"),text("books[0].favorite"));for(String key:new String[]{"id","title","author","note","photo"})assertEquals(expected.getString(key),text("books[0]["+JSONObject.quote(key)+"]"));
        assertEquals("true",js("books[0].createdAt==="+expected.getLong("createdAt")));assertEquals("2025-03-04",text("books[0].volumes[0].soldAt"));assertEquals("미보유",text("books[0].volumes[2].status"));
        js("document.querySelector('.book-card').click()");waitFor("document.querySelector('#detail-album img')?.naturalWidth>0");assertEquals(expected.has("photos")?"2":"1",js("bookPhotos(books[0]).length"));if(expected.has("photos")){assertStrings(expected.getJSONArray("photos"),"books[0].photos");assertEquals(expected.getString("folder"),text("books[0].folder"));}assertStrings(new JSONArray(new String(Files.readAllBytes(new File(context().getFilesDir(),"upgrade-folders.json").toPath()),StandardCharsets.UTF_8)),"folders");assertEquals(expected.getString("photo"),text("bookPhotos(books[0])[0]"));
        js("document.querySelector('#detail .close').click()");activity.getScenario().recreate();waitFor("document.querySelector('.cover img')?.naturalWidth>0");assertEquals(expected.getString("photo"),text("books[0].photo"));
    }
}
