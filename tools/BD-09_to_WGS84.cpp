#include <bits/stdc++.h>
using namespace std;
using ll = long long;

const double PI = 3.14159265358979323846;
const double A  = 6378245.0;
const double EE = 0.00669342162296594323;

// 显式使用全局C数学函数，避免 std:: 重载集合引发的歧义
using ::sin;
using ::cos;
using ::sqrt;
using ::fabs;
using ::atan2;

bool outOfChina(double lng, double lat){
    return (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271);
}

double transformLat(double x, double y){
    double ret = -100.0 + 2.0*x + 3.0*y + 0.2*y*y + 0.1*x*y + 0.2*sqrt(fabs(x));
    ret += (20.0*sin(6.0*x*PI) + 20.0*sin(2.0*x*PI)) * 2.0/3.0;
    ret += (20.0*sin(y*PI) + 40.0*sin(y/3.0*PI)) * 2.0/3.0;
    ret += (160.0*sin(y/12.0*PI) + 320.0*sin(y*PI/30.0)) * 2.0/3.0;
    return ret;
}

double transformLon(double x, double y){
    double ret = 300.0 + x + 2.0*y + 0.1*x*x + 0.1*x*y + 0.1*sqrt(fabs(x));
    ret += (20.0*sin(6.0*x*PI) + 20.0*sin(2.0*x*PI)) * 2.0/3.0;
    ret += (20.0*sin(x*PI) + 40.0*sin(x/3.0*PI)) * 2.0/3.0;
    ret += (150.0*sin(x/12.0*PI) + 300.0*sin(x/30.0*PI)) * 2.0/3.0;
    return ret;
}

pair<double,double> bd09_to_gcj02(double bd_lng, double bd_lat){
    double x = bd_lng - 0.0065;
    double y = bd_lat - 0.006;
    double z = sqrt(x*x + y*y) - 0.00002 * sin(y * PI);
    double theta = atan2(y, x) - 0.000003 * cos(x * PI);
    double gg_lng = z * cos(theta);
    double gg_lat = z * sin(theta);
    return {gg_lng, gg_lat};
}

pair<double,double> wgs84_to_gcj02(double lng, double lat){
    if (outOfChina(lng, lat)) return {lng, lat};
    double dLat = transformLat(lng - 105.0, lat - 35.0);
    double dLng = transformLon(lng - 105.0, lat - 35.0);
    double radLat = lat / 180.0 * PI;
    double magic = sin(radLat);
    magic = 1 - EE * magic * magic;
    double sqrtMagic = sqrt(magic);
    dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
    dLng = (dLng * 180.0) / (A / sqrtMagic * cos(radLat) * PI);
    double mgLat = lat + dLat;
    double mgLng = lng + dLng;
    return {mgLng, mgLat};
}

pair<double,double> gcj02_to_wgs84(double lng, double lat){
    if (outOfChina(lng, lat)) return {lng, lat};
    const double threshold = 1e-7; // ~0.011m
    double minLat = lat - 0.5, maxLat = lat + 0.5;
    double minLng = lng - 0.5, maxLng = lng + 0.5;
    double midLat = 0.0, midLng = 0.0;
    for (int i = 0; i < 30; ++i) {
        midLat = (minLat + maxLat) / 2.0;
        midLng = (minLng + maxLng) / 2.0;
        auto tmp = wgs84_to_gcj02(midLng, midLat);
        double dLng = tmp.first - lng;
        double dLat = tmp.second - lat;
        if (fabs(dLat) < threshold && fabs(dLng) < threshold) {
            return {midLng, midLat};
        }
        if (dLat > 0) {
            maxLat = midLat;
        } else {
            minLat = midLat;
        }
        if (dLng > 0) {
            maxLng = midLng;
        } else {
            minLng = midLng;
        }
    }
    return {midLng, midLat};
}

pair<double,double> bd09_to_wgs84(double bd_lng, double bd_lat){
    auto g = bd09_to_gcj02(bd_lng, bd_lat);
    return gcj02_to_wgs84(g.first, g.second);
}

int main(){
    ios::sync_with_stdio(0);
    cin.tie(0);

    cout.setf(ios::fixed);
    cout << setprecision(8);

    while (1) {
        char delimiter;
        double bd_lng, bd_lat;
        if (!(cin >> bd_lng >> delimiter >> bd_lat)) break;
        auto w = bd09_to_wgs84(bd_lng, bd_lat);
        cout << w.first + 0.0001 << delimiter << ' ' << w.second - 0.0003 << '\n';
    }
    return 0;
}
