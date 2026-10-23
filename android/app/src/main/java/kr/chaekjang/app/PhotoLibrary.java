package kr.chaekjang.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.core.content.FileProvider;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.function.*;

/** Copies sale photos into the library; exports user-selected copies without deleting originals. */
final class PhotoLibrary {
    static final int PICK=3001,CAMERA=3002,FOLDER=3003,SHARE=3004,SAVE=3005;
    private final MainActivity activity;
    private final ExecutorService io;
    private final IntPredicate begin;
    private final Runnable finish;
    private final BiConsumer<String,String> event;
    private final Consumer<String> message;
    private String requestId;
    private int limit=12;
    private File camera;
    PhotoLibrary(MainActivity a,ExecutorService executor,IntPredicate b,Runnable f,BiConsumer<String,String> e,Consumer<String> m,Bundle state){activity=a;io=executor;begin=b;finish=f;event=e;message=m;if(state!=null){requestId=state.getString("albumRequest");limit=state.getInt("albumLimit",12);String name=state.getString("albumCamera");if(name!=null)camera=new File(new File(a.getCacheDir(),"camera"),name);}}
    void saveState(Bundle state){state.putString("albumRequest",requestId);state.putInt("albumLimit",limit);if(camera!=null)state.putString("albumCamera",camera.getName());}
    private void done(){activity.runOnUiThread(finish);}
    private void report(String token,List<String> photos,String error){try{JSONObject d=new JSONObject();d.put("requestId",token);d.put("photos",new JSONArray(photos));d.put("error",error==null?JSONObject.NULL:error);event.accept("chaekjang-photos",d.toString());}catch(Exception ignored){}}
    void choose(String token,int available){activity.runOnUiThread(()->{if(!begin.test(PICK)){report(token,Collections.emptyList(),"다른 사진 선택을 먼저 마쳐 주세요.");return;}requestId=token;limit=Math.max(1,Math.min(12,available));try{activity.startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*").putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true),PICK);}catch(Exception e){done();report(token,Collections.emptyList(),"사진 선택 창을 열지 못했어요.");}});}
    void take(String token){activity.runOnUiThread(()->{if(!begin.test(CAMERA)){report(token,Collections.emptyList(),"다른 사진 선택을 먼저 마쳐 주세요.");return;}requestId=token;try{File dir=new File(activity.getCacheDir(),"camera");if(!dir.isDirectory()&&!dir.mkdirs())throw new IOException();camera=new File(dir,UUID.randomUUID()+".jpg");Uri uri=FileProvider.getUriForFile(activity,activity.getPackageName()+".files",camera);Intent intent=new Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);intent.setClipData(ClipData.newRawUri("책 사진",uri));activity.startActivityForResult(intent,CAMERA);}catch(Exception e){done();report(token,Collections.emptyList(),"카메라를 열지 못했어요. 사진 추가를 이용해 주세요.");}});}
    private byte[] read(InputStream input,int max)throws Exception{if(input==null)throw new IOException();try(InputStream in=input;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1){if(out.size()+n>max)throw new IOException("Too large");out.write(b,0,n);}return out.toByteArray();}}
    private File pending(){return new File(activity.getCacheDir(),"pending-album-export.json");}
    private List<byte[]> decode(JSONArray photos)throws Exception{
        if(photos.length()<1||photos.length()>12)throw new IOException();List<byte[]> result=new ArrayList<>();
        for(int i=0;i<photos.length();i++){String data=photos.getString(i);if(data.length()>700000||!data.startsWith("data:image/jpeg;base64,/9j/"))throw new IOException();byte[] bytes=Base64.decode(data.substring(23),Base64.DEFAULT);BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.length,bounds);if(bounds.outWidth<1||bounds.outHeight<1||Math.max(bounds.outWidth,bounds.outHeight)>2000)throw new IOException("Invalid JPEG");result.add(bytes);}return result;
    }
    private String prefix(String title){String safe=title.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]","_");if(safe.length()>40)safe=safe.substring(0,40);return "책장-"+safe+"-"+UUID.randomUUID().toString().substring(0,8);}
    void output(String encoded,String title,String mode){activity.runOnUiThread(()->{final boolean share="share".equals(mode);if(!begin.test(share?SHARE:SAVE))return;io.execute(()->{try{
        if(encoded.length()>8500000)throw new IOException();JSONArray photos=new JSONArray(encoded);List<byte[]> bytes=decode(photos);String name=prefix(title);
        if(share){List<Uri> uris=new ArrayList<>();File dir=new File(activity.getCacheDir(),"backups");if(!dir.isDirectory()&&!dir.mkdirs())throw new IOException();for(int i=0;i<bytes.size();i++){File file=new File(dir,name+"-"+(i+1)+".jpg");try(OutputStream out=new FileOutputStream(file)){out.write(bytes.get(i));}uris.add(FileProvider.getUriForFile(activity,activity.getPackageName()+".files",file));}
            activity.runOnUiThread(()->{try{Intent send=new Intent(uris.size()==1?Intent.ACTION_SEND:Intent.ACTION_SEND_MULTIPLE).setType("image/jpeg").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);if(uris.size()==1)send.putExtra(Intent.EXTRA_STREAM,uris.get(0));else send.putParcelableArrayListExtra(Intent.EXTRA_STREAM,new ArrayList<>(uris));ClipData clip=ClipData.newRawUri("책 사진",uris.get(0));for(int i=1;i<uris.size();i++)clip.addItem(new ClipData.Item(uris.get(i)));send.setClipData(clip);activity.startActivityForResult(Intent.createChooser(send,"사진을 보낼 앱"),SHARE);}catch(Exception e){done();message.accept("사진 공유 창을 열지 못했어요. 사진 저장을 이용해 주세요.");}});
        }else if(Build.VERSION.SDK_INT>=29){List<Uri> saved=saveGallery(bytes,name);done();message.accept("사진 "+saved.size()+"장을 갤러리의 책장 폴더에 저장했어요.");exported(saved);}
        else{JSONObject staging=new JSONObject();staging.put("photos",photos);staging.put("name",name);try(OutputStream out=new FileOutputStream(pending())){out.write(staging.toString().getBytes(StandardCharsets.UTF_8));}activity.runOnUiThread(()->{try{activity.startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION),FOLDER);}catch(Exception e){pending().delete();done();message.accept("저장할 폴더를 열지 못했어요.");}});}
    }catch(Exception|OutOfMemoryError e){done();message.accept("사진을 내보내지 못했어요. 저장 공간을 확인한 뒤 다시 시도해 주세요.");}});});}
    private void exported(List<Uri> uris){try{JSONObject d=new JSONObject();JSONArray a=new JSONArray();for(Uri uri:uris)a.put(uri.toString());d.put("uris",a);d.put("count",uris.size());event.accept("chaekjang-photos-exported",d.toString());}catch(Exception ignored){}}
    @android.annotation.TargetApi(29) private List<Uri> saveGallery(List<byte[]> images,String name)throws Exception{
        List<Uri> saved=new ArrayList<>();try{for(int i=0;i<images.size();i++){ContentValues values=new ContentValues();values.put(MediaStore.Images.Media.DISPLAY_NAME,name+"-"+(i+1)+".jpg");values.put(MediaStore.Images.Media.MIME_TYPE,"image/jpeg");values.put(MediaStore.Images.Media.RELATIVE_PATH,"Pictures/책장");values.put(MediaStore.Images.Media.IS_PENDING,1);Uri uri=activity.getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,values);if(uri==null)throw new IOException();saved.add(uri);try(OutputStream out=activity.getContentResolver().openOutputStream(uri,"w")){if(out==null)throw new IOException();out.write(images.get(i));}values.clear();values.put(MediaStore.Images.Media.IS_PENDING,0);activity.getContentResolver().update(uri,values,null,null);}return saved;}catch(Exception e){for(Uri uri:saved)try{activity.getContentResolver().delete(uri,null,null);}catch(Exception ignored){}throw e;}
    }
    boolean result(int code,int result,Intent data){
        if(code==SHARE){done();message.accept("선택한 앱에서 사진 전송을 마쳐 주세요.");return true;}
        if(code==FOLDER){if(result!=Activity.RESULT_OK||data==null||data.getData()==null){pending().delete();done();message.accept("사진 저장을 취소했어요.");return true;}final Uri tree=data.getData();io.execute(()->{List<Uri> saved=new ArrayList<>();try{JSONObject staging=new JSONObject(new String(read(new FileInputStream(pending()),9000000),StandardCharsets.UTF_8));List<byte[]> images=decode(staging.getJSONArray("photos"));Uri parent=DocumentsContract.buildDocumentUriUsingTree(tree,DocumentsContract.getTreeDocumentId(tree));for(int i=0;i<images.size();i++){Uri file=DocumentsContract.createDocument(activity.getContentResolver(),parent,"image/jpeg",staging.getString("name")+"-"+(i+1)+".jpg");if(file==null)throw new IOException();saved.add(file);try(OutputStream out=activity.getContentResolver().openOutputStream(file,"w")){if(out==null)throw new IOException();out.write(images.get(i));}}message.accept("사진 "+saved.size()+"장을 선택한 폴더에 저장했어요.");exported(saved);}catch(Exception e){for(Uri file:saved)try{DocumentsContract.deleteDocument(activity.getContentResolver(),file);}catch(Exception ignored){}message.accept("사진을 저장하지 못했어요. 다른 폴더나 공유를 이용해 주세요.");}finally{pending().delete();done();}});return true;}
        if(code!=PICK&&code!=CAMERA)return false;final String token=requestId;final File capture=camera;
        if(result!=Activity.RESULT_OK||(code==PICK&&(data==null||(data.getData()==null&&data.getClipData()==null)))){if(code==CAMERA&&capture!=null)capture.delete();done();report(token,Collections.emptyList(),null);return true;}
        List<Uri> uris=new ArrayList<>();if(code==PICK){if(data.getClipData()!=null){ClipData clip=data.getClipData();if(clip.getItemCount()>limit){done();report(token,Collections.emptyList(),"최대 "+limit+"장 더 추가할 수 있어요.");return true;}for(int i=0;i<clip.getItemCount();i++)uris.add(clip.getItemAt(i).getUri());}else uris.add(data.getData());}
        io.execute(()->{try{List<String> photos=new ArrayList<>();if(code==CAMERA)photos.add(activity.resalePhoto(read(new FileInputStream(capture),32*1024*1024)));else for(Uri uri:uris)photos.add(activity.resalePhoto(read(activity.getContentResolver().openInputStream(uri),32*1024*1024)));report(token,photos,null);}catch(Exception|OutOfMemoryError e){report(token,Collections.emptyList(),"사진을 읽지 못했어요. 32MB 이하의 JPG·PNG 사진으로 다시 선택해 주세요.");}finally{if(code==CAMERA&&capture!=null)capture.delete();done();}});return true;
    }
}
