package kr.chaekjang.app;

import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.action.ViewActions.click;
import static androidx.test.espresso.matcher.ViewMatchers.withText;
import static androidx.test.espresso.intent.Intents.intended;
import static androidx.test.espresso.intent.Intents.intending;
import static androidx.test.espresso.intent.VerificationModes.times;
import static androidx.test.espresso.intent.matcher.IntentMatchers.hasAction;
import static androidx.test.espresso.intent.matcher.IntentMatchers.hasType;
import static org.hamcrest.Matchers.allOf;
import static org.junit.Assert.*;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.provider.MediaStore;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import androidx.test.espresso.intent.Intents;
import androidx.test.ext.junit.rules.ActivityScenarioRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public class NativeFilesTest {
    @Rule public ActivityScenarioRule<MainActivity> activity=new ActivityScenarioRule<>(MainActivity.class);
    private Context context(){return InstrumentationRegistry.getInstrumentation().getTargetContext();}
    private String js(String script) throws Exception{
        CountDownLatch done=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();
        activity.getScenario().onActivity(a->((WebView)a.findViewById(android.R.id.primary)).evaluateJavascript(script,r->{value.set(r);done.countDown();}));
        assertTrue("JavaScript callback timed out: "+script,done.await(10,TimeUnit.SECONDS));return value.get();
    }
    private void fire(String script){activity.getScenario().onActivity(a->((WebView)a.findViewById(android.R.id.primary)).evaluateJavascript(script,null));}
    private void waitJs(String expression) throws Exception{
        long end=System.currentTimeMillis()+15000;
        while(System.currentTimeMillis()<end){if("true".equals(js(expression)))return;Thread.sleep(100);}
        fail("Timed out: "+expression+"; toast="+js("document.querySelector('#toast').textContent"));
    }
    private File fixture(String name) throws Exception{File dir=new File(context().getCacheDir(),"backups");assertTrue(dir.isDirectory()||dir.mkdirs());return new File(dir,name);}
    private Uri uri(File file){return FileProvider.getUriForFile(context(),context().getPackageName()+".files",file);}
    private void shell(String command) throws Exception{
        try(java.io.InputStream in=new android.os.ParcelFileDescriptor.AutoCloseInputStream(InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(command))){
            byte[] buffer=new byte[1024];while(in.read(buffer)!=-1){}
        }
    }
    @Before public void prepare() throws Exception{
        shell("input keyevent KEYCODE_WAKEUP");
        shell("wm dismiss-keyguard");
        shell("settings put system screen_off_timeout 1800000");
        long focusDeadline=System.currentTimeMillis()+10000;boolean focused=false;
        while(System.currentTimeMillis()<focusDeadline){
            AtomicReference<Boolean> focus=new AtomicReference<>(false);
            activity.getScenario().onActivity(a->focus.set(a.hasWindowFocus()));
            if(focus.get()){focused=true;break;}Thread.sleep(100);
        }
        assertTrue("Emulator window must be awake, unlocked and focused before UI tests",focused);
        waitJs("document.querySelector('#loading').hidden");
        fire("saveCollection([]).then(()=>{books=[];render();window.__resetDone=true;})");waitJs("window.__resetDone===true");Intents.init();
    }
    @After public void finish(){Intents.release();}

    @Test public void visibleVersionMatchesInstalledPackage() throws Exception{
        String version=context().getPackageManager().getPackageInfo(context().getPackageName(),0).versionName;
        assertEquals(JSONObject.quote("v"+version),js("document.querySelector('#app-version').textContent"));
        assertEquals("true",js("document.querySelector('#app-version').getBoundingClientRect().top>=0"));
    }
    @Test public void missingVolumesRemainSelectableAndPurchasePersists() throws Exception{
        fire("document.querySelector('#add').click();document.querySelector('[name=title]').value='권별 테스트';document.querySelector('[name=to]').value='10';document.querySelector('[name=missing]').value='3,7-9';document.querySelector('#book-form').requestSubmit()");
        waitJs("books.length===1 && !saveBusy");
        fire("document.querySelector('.book-card').click()");
        assertEquals("10",js("document.querySelectorAll('#volumes label').length"));
        assertEquals("4",js("document.querySelectorAll('#volumes .missing').length"));
        assertEquals("false",js("document.querySelector('#volumes input[value=\"3\"]').disabled"));
        fire("document.querySelector('#volumes input[value=\"3\"]').click();document.querySelector('#apply').click()");
        waitJs("books[0].volumes[2].status==='보유중' && !saveBusy");
        activity.getScenario().recreate();
        waitJs("document.querySelector('#loading').hidden && books.length===1");
        assertEquals(JSONObject.quote("보유중"),js("books[0].volumes[2].status"));
        assertEquals("3",js("books[0].volumes.filter(v=>v.status==='미보유').length"));
    }
    @Test public void backupButtonsCreateRealFileAndRecoverAfterCancel() throws Exception{
        intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_CANCELED,null));
        fire("document.querySelector('#backup').click();document.querySelector('#save-backup').click()");
        waitJs("document.querySelector('#toast').textContent.includes('취소')");
        fire("document.querySelector('#backup').click();document.querySelector('#save-backup').click()");
        waitJs("document.querySelector('#toast').textContent.includes('취소')");
        intended(hasAction(Intent.ACTION_CREATE_DOCUMENT),times(2));
    }
    @Test public void backupActuallyWritesJsonToSelectedPhoneDocument() throws Exception{
        File output=fixture("test-export.json");if(output.exists())assertTrue(output.delete());
        intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_OK,new Intent().setData(uri(output))));
        fire("document.querySelector('#backup').click();document.querySelector('#save-backup').click()");waitJs("document.querySelector('#toast').textContent.includes('백업 파일을 저장했어요')");
        JSONObject backup=new JSONObject(new String(Files.readAllBytes(output.toPath()),StandardCharsets.UTF_8));assertEquals(2,backup.getInt("version"));assertEquals(0,backup.getJSONArray("books").length());
        intended(hasAction(Intent.ACTION_CREATE_DOCUMENT));
    }
    @Test public void restoreButtonReadsBackupAndPreservesSaleDates() throws Exception{
        File input=fixture("test-import.json");String json="{\"version\":2,\"books\":[{\"id\":\"restored\",\"title\":\"복원 테스트\",\"author\":\"작가\",\"note\":\"메모\",\"createdAt\":1700000000000,\"volumes\":[{\"number\":1,\"status\":\"거래완료\",\"soldAt\":\"2025-01-02\"}]}]}";
        try(FileOutputStream out=new FileOutputStream(input)){out.write(json.getBytes(StandardCharsets.UTF_8));}
        intending(hasAction(Intent.ACTION_OPEN_DOCUMENT)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_OK,new Intent().setData(uri(input))));
        fire("document.querySelector('#restore').click()");
        long end=System.currentTimeMillis()+10000;boolean confirmed=false;
        while(System.currentTimeMillis()<end){try{onView(withText("확인")).perform(click());confirmed=true;break;}catch(androidx.test.espresso.NoMatchingViewException e){Thread.sleep(100);}}
        assertTrue("Restore confirmation should appear",confirmed);waitJs("document.querySelector('.card-dates')?.textContent.includes('2025.01.02')===true");
        assertEquals("1",js("books[0].volumes.length"));assertEquals("true",js("books[0].createdAt===1700000000000"));intended(hasAction(Intent.ACTION_OPEN_DOCUMENT));
        activity.getScenario().recreate();waitJs("document.querySelector('.card-dates')?.textContent.includes('2025.01.02')===true");
    }
    @Test public void galleryPhotoIsCompressedSavedAndRestoredAfterRestart() throws Exception{
        File image=fixture("test-photo.jpg");Bitmap b=Bitmap.createBitmap(600,800,Bitmap.Config.ARGB_8888);b.eraseColor(Color.rgb(30,110,160));try(FileOutputStream out=new FileOutputStream(image)){assertTrue(b.compress(Bitmap.CompressFormat.JPEG,95,out));}b.recycle();
        intending(allOf(hasAction(Intent.ACTION_OPEN_DOCUMENT),hasType("image/*"))).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_OK,new Intent().setData(uri(image))));
        fire("document.querySelector('#add').click();document.querySelector('[data-photo=editor][data-source=gallery]').click()");
        waitJs("!document.querySelector('#editor-preview img').hidden && document.querySelector('#editor-preview img').naturalWidth>0");assertTrue(Integer.parseInt(js("draftPhotos.editor.length"))<=33000);
        fire("document.querySelector('[name=title]').value='사진 테스트';document.querySelector('#book-form').requestSubmit()");waitJs("document.querySelector('.cover img')?.naturalWidth>0");
        activity.getScenario().recreate();waitJs("document.querySelector('.cover img')?.naturalWidth>0");intended(allOf(hasAction(Intent.ACTION_OPEN_DOCUMENT),hasType("image/*")));
    }
    @Test public void cameraCancelAllowsSelectingAnotherPhoto() throws Exception{
        intending(hasAction(MediaStore.ACTION_IMAGE_CAPTURE)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_CANCELED,null));
        fire("document.querySelector('#add').click();document.querySelector('[data-photo=editor][data-source=camera]').click()");waitJs("photoRequest===null");
        fire("document.querySelector('[data-photo=editor][data-source=camera]').click()");waitJs("photoRequest===null");intended(hasAction(MediaStore.ACTION_IMAGE_CAPTURE),times(2));
    }
    @Test public void driveShareOpensChooserWithReadableBackup() throws Exception{
        intending(hasAction(Intent.ACTION_CHOOSER)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_CANCELED,null));
        fire("document.querySelector('#backup').click();document.querySelector('#share-backup').click()");waitJs("document.querySelector('#toast').textContent.includes('공유 앱')");intended(hasAction(Intent.ACTION_CHOOSER));
    }
}
